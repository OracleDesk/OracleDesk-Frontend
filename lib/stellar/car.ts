import { parseCid, parseCidBytes, readVarint, type ParsedCid, RAW_CODEC, DAG_PB_CODEC, SHA2_256_CODE } from "./cid";
import { decodePBNode, decodeUnixFS, UnixFSType } from "./unixfs";
import { Sha256 } from "./sha256";

export interface CarLimits {
  maxCarBytes: number;
  maxBlocks: number;
  maxBlockBytes: number;
  maxDepth: number;
  maxFileBytes: number;
}

export interface CarBlock {
  cid: ParsedCid & { bytes: Uint8Array };
  data: Uint8Array;
}

export interface CarHeader {
  header: {
    version: number;
    roots: Uint8Array[];
  };
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Minimal CBOR parser specifically for CARv1 header: { version: 1, roots: [tag 42 byte arrays] } */
function decodeCborHeader(bytes: Uint8Array): { version: number; roots: Uint8Array[] } {
  let offset = 0;

  function readByte(): number {
    if (offset >= bytes.length) throw new Error("Unexpected end of CBOR data");
    return bytes[offset++];
  }

  function readUint(info: number): number {
    if (info < 24) return info;
    if (info === 24) return readByte();
    if (info === 25) {
      const b1 = readByte();
      const b2 = readByte();
      return (b1 << 8) | b2;
    }
    if (info === 26) {
      const b1 = readByte();
      const b2 = readByte();
      const b3 = readByte();
      const b4 = readByte();
      return (b1 * 16777216) + (b2 << 16) + (b3 << 8) + b4;
    }
    throw new Error(`Unsupported CBOR uint size: ${info}`);
  }

  function parseItem(): unknown {
    const initial = readByte();
    const major = initial >> 5;
    const info = initial & 0x1f;

    if (major === 0) {
      // Unsigned integer
      return readUint(info);
    }
    if (major === 2) {
      // Byte string
      const len = readUint(info);
      if (offset + len > bytes.length) throw new Error("CBOR byte string out of bounds");
      const res = bytes.subarray(offset, offset + len);
      offset += len;
      return res;
    }
    if (major === 3) {
      // Text string
      const len = readUint(info);
      if (offset + len > bytes.length) throw new Error("CBOR text string out of bounds");
      const text = new TextDecoder().decode(bytes.subarray(offset, offset + len));
      offset += len;
      return text;
    }
    if (major === 4) {
      // Array
      const len = readUint(info);
      const arr: unknown[] = [];
      for (let i = 0; i < len; i++) arr.push(parseItem());
      return arr;
    }
    if (major === 5) {
      // Map
      const len = readUint(info);
      const map: Record<string, unknown> = {};
      for (let i = 0; i < len; i++) {
        const key = parseItem();
        const val = parseItem();
        if (typeof key === "string") map[key] = val;
      }
      return map;
    }
    if (major === 6) {
      // Tag
      const tag = readUint(info);
      const nested = parseItem();
      if (tag === 42 && nested instanceof Uint8Array) {
        // Tag 42 CID: bytes usually start with a 0x00 multibase byte prefix in IPLD
        return nested[0] === 0x00 ? nested.subarray(1) : nested;
      }
      return nested;
    }
    throw new Error(`Unsupported CBOR major type: ${major}`);
  }

  const parsed = parseItem() as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid CAR header CBOR");
  const version = Number(parsed.version);
  if (version !== 1) throw new Error(`Unsupported CAR version: ${version}`);
  const rootsRaw = Array.isArray(parsed.roots) ? parsed.roots : [];
  const roots: Uint8Array[] = rootsRaw.map((r) => {
    if (r instanceof Uint8Array) return r;
    throw new Error("Invalid CID root in CAR header");
  });
  return { version, roots };
}

/** Streaming buffer reader for ReadableStream */
class StreamReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = new Uint8Array(0);
  private done = false;
  private totalRead = 0;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  get bytesRead(): number {
    return this.totalRead;
  }

  async readExact(size: number): Promise<Uint8Array | null> {
    while (this.buffer.length < size) {
      if (this.done) {
        if (this.buffer.length === 0) return null;
        throw new Error("Unexpected end of stream");
      }
      const { value, done } = await this.reader.read();
      if (done) {
        this.done = true;
      } else if (value) {
        const combined = new Uint8Array(this.buffer.length + value.length);
        combined.set(this.buffer);
        combined.set(value, this.buffer.length);
        this.buffer = combined;
      }
    }
    const result = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    this.totalRead += size;
    return result;
  }

  async readVarint(): Promise<number | null> {
    let value = 0;
    let shift = 0;
    for (let i = 0; i < 9; i++) {
      const byteBuf = await this.readExact(1);
      if (!byteBuf) {
        if (i === 0) return null;
        throw new Error("Truncated varint in stream");
      }
      const byte = byteBuf[0];
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
    }
    throw new Error("Varint overflow in stream");
  }

  async cancel(): Promise<void> {
    await this.reader.cancel().catch(() => undefined);
  }
}

/**
 * Async generator that reads a CARv1 stream, verifies each block multihash,
 * and enforces strict limits.
 */
export async function* readCar(
  stream: ReadableStream<Uint8Array>,
  limits: CarLimits,
): AsyncGenerator<CarBlock | CarHeader> {
  const reader = new StreamReader(stream);
  try {
    const headerLen = await reader.readVarint();
    if (headerLen === null) throw new Error("Empty CAR stream");
    if (headerLen > limits.maxBlockBytes) throw new Error("CAR header exceeds maxBlockBytes");
    if (reader.bytesRead + headerLen > limits.maxCarBytes) throw new Error("CAR stream exceeds maxCarBytes");

    const headerBytes = await reader.readExact(headerLen);
    if (!headerBytes) throw new Error("Failed to read CAR header");

    const header = decodeCborHeader(headerBytes);
    yield { header };

    let blockCount = 0;

    while (true) {
      const sectionLen = await reader.readVarint();
      if (sectionLen === null) break; // End of CAR

      blockCount++;
      if (blockCount > limits.maxBlocks) throw new Error("CAR block count exceeded limit");
      if (sectionLen > limits.maxBlockBytes) throw new Error("CAR block exceeds maxBlockBytes");
      if (reader.bytesRead + sectionLen > limits.maxCarBytes) throw new Error("CAR stream exceeds maxCarBytes");

      const sectionBytes = await reader.readExact(sectionLen);
      if (!sectionBytes) throw new Error("Truncated CAR section");

      // Parse CID from beginning of section
      const parsedCid = parseCidBytes(sectionBytes);
      if (!parsedCid) throw new Error("Invalid CID in CAR section");

      // Verify CID digest function is sha2-256
      if (parsedCid.hashCode !== SHA2_256_CODE) {
        throw new Error(`Unsupported CID multihash algorithm: 0x${parsedCid.hashCode.toString(16)}`);
      }

      const data = sectionBytes.subarray(parsedCid.bytes.length);

      // Verify sha256 multihash
      const hasher = new Sha256();
      hasher.update(data);
      const blockHash = hasher.digest();
      const expectedDigest = parsedCid.digest;

      if (blockHash.length !== expectedDigest.length) {
        throw new Error("Block digest length mismatch");
      }
      for (let i = 0; i < blockHash.length; i++) {
        if (blockHash[i] !== expectedDigest[i]) {
          throw new Error("Block digest does not match CID");
        }
      }

      yield { cid: parsedCid, data };
    }
  } catch (err) {
    await reader.cancel();
    throw err;
  }
}

function cidLookupKey(cidBytesOrDigest: Uint8Array): string {
  // Key by hex representation of digest for universal matching across CIDv0 and CIDv1
  const parsed = parseCidBytes(cidBytesOrDigest);
  if (parsed) return toHex(parsed.digest);
  return toHex(cidBytesOrDigest);
}

/**
 * Reassembles a file from CAR blocks via DFS starting from root.
 * Enforces depth limit, cycle rejection, block sizes, and maxFileBytes.
 */
export async function verifyCarFile(
  root: Uint8Array | string,
  carSource: AsyncIterable<CarBlock | CarHeader> | Map<string, CarBlock>,
  limits: CarLimits,
  onBytes?: (chunk: Uint8Array) => void,
): Promise<{ bytes: Uint8Array; hex: string }> {
  const blocks = new Map<string, CarBlock>();
  let rootCidKey = "";

  if (typeof root === "string") {
    const parsed = parseCid(root);
    if (!parsed) throw new Error(`Invalid root CID: ${root}`);
    rootCidKey = toHex(parsed.digest);
  } else {
    rootCidKey = cidLookupKey(root);
  }

  if (carSource instanceof Map) {
    for (const [k, v] of carSource.entries()) {
      blocks.set(k, v);
    }
  } else {
    for await (const item of carSource) {
      if ("cid" in item) {
        blocks.set(toHex(item.cid.digest), item);
      }
    }
  }

  const rootBlock = blocks.get(rootCidKey);
  if (!rootBlock) throw new Error("Root block not found in CAR blocks");

  const emittedChunks: Uint8Array[] = [];
  let totalBytes = 0;
  const hasher = new Sha256();

  function emit(chunk: Uint8Array) {
    if (chunk.length === 0) return;
    totalBytes += chunk.length;
    if (totalBytes > limits.maxFileBytes) {
      throw new Error("Reassembled file exceeds maxFileBytes");
    }
    hasher.update(chunk);
    emittedChunks.push(chunk);
    onBytes?.(chunk);
  }

  function dfs(cidKey: string, depth: number, path: Set<string>): { emittedForNode: number; declaredFilesize?: bigint } {
    if (depth > limits.maxDepth) {
      throw new Error(`CAR DAG depth exceeded limit of ${limits.maxDepth}`);
    }
    if (path.has(cidKey)) {
      throw new Error("Cycle detected in CAR DAG");
    }

    const block = blocks.get(cidKey);
    if (!block) throw new Error(`Missing block in CAR DAG: ${cidKey}`);

    path.add(cidKey);
    const startBytes = totalBytes;
    let declaredFilesize: bigint | undefined;

    if (block.cid.codec === RAW_CODEC) {
      emit(block.data);
    } else if (block.cid.codec === DAG_PB_CODEC) {
      const pbNode = decodePBNode(block.data);
      let unixfsData: ReturnType<typeof decodeUnixFS> | undefined;

      if (pbNode.data) {
        unixfsData = decodeUnixFS(pbNode.data);
        if (unixfsData.type !== UnixFSType.File && unixfsData.type !== UnixFSType.Raw) {
          throw new Error(`Unsupported UnixFS type in CAR: ${unixfsData.type}`);
        }
        if (unixfsData.data) {
          emit(unixfsData.data);
        }
        declaredFilesize = unixfsData.filesize;
      }

      if (pbNode.links.length > 0) {
        let childBytesSum = 0n;
        for (let i = 0; i < pbNode.links.length; i++) {
          const link = pbNode.links[i];
          const childKey = cidLookupKey(link.hash);
          const { emittedForNode } = dfs(childKey, depth + 1, path);
          childBytesSum += BigInt(emittedForNode);

          if (unixfsData && unixfsData.blocksizes.length > i) {
            const expectedBlockSize = unixfsData.blocksizes[i];
            if (BigInt(emittedForNode) !== expectedBlockSize) {
              throw new Error(
                `Child blocksize mismatch: expected ${expectedBlockSize}, got ${emittedForNode}`,
              );
            }
          }
        }

        if (declaredFilesize !== undefined && childBytesSum + BigInt(unixfsData?.data?.length ?? 0) !== declaredFilesize) {
          throw new Error("Sum of child blocksizes does not match declared filesize");
        }
      }
    } else {
      throw new Error(`Unsupported CID codec in CAR: 0x${block.cid.codec.toString(16)}`);
    }

    path.delete(cidKey);
    return { emittedForNode: totalBytes - startBytes, declaredFilesize };
  }

  const { declaredFilesize } = dfs(rootCidKey, 0, new Set<string>());

  if (declaredFilesize !== undefined && BigInt(totalBytes) !== declaredFilesize) {
    throw new Error(`Reassembled file size ${totalBytes} does not match root declared size ${declaredFilesize}`);
  }

  const hex = toHex(hasher.digest());
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of emittedChunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return { bytes, hex };
}
