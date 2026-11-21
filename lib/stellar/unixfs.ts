/**
 * Minimal dependency-free protobuf decoder for IPFS dag-pb and UnixFS structures.
 * See:
 *   - dag-pb: https://ipld.io/specs/codecs/dag-pb/spec/
 *   - UnixFS: https://specs.ipfs.tech/unixfs/
 */

export interface PBLink {
  hash: Uint8Array;
  name?: string;
  tsize?: bigint;
}

export interface PBNode {
  data?: Uint8Array;
  links: PBLink[];
}

export enum UnixFSType {
  Raw = 0,
  Directory = 1,
  File = 2,
  Metadata = 3,
  Symlink = 4,
  HAMTShard = 5,
}

export interface UnixFSData {
  type: UnixFSType;
  data?: Uint8Array;
  filesize?: bigint;
  blocksizes: bigint[];
}

function readVarint(bytes: Uint8Array, offset: number): { value: bigint; next: number } {
  let value = 0n;
  let shift = 0n;
  let i = offset;
  while (i < bytes.length) {
    const byte = bytes[i];
    value |= BigInt(byte & 0x7f) << shift;
    i++;
    if ((byte & 0x80) === 0) {
      return { value, next: i };
    }
    shift += 7n;
    if (shift > 70n) throw new Error("Protobuf varint overflow");
  }
  throw new Error("Unexpected end of protobuf varint");
}

/** Decodes a PBLink protobuf message. */
function decodePBLink(bytes: Uint8Array): PBLink {
  let offset = 0;
  let hash: Uint8Array | undefined;
  let name: string | undefined;
  let tsize: bigint | undefined;

  while (offset < bytes.length) {
    const { value: tagWire, next } = readVarint(bytes, offset);
    offset = next;
    const fieldNumber = Number(tagWire >> 3n);
    const wireType = Number(tagWire & 7n);

    if (wireType === 2) {
      // Length-delimited
      const { value: len, next: afterLen } = readVarint(bytes, offset);
      const length = Number(len);
      const end = afterLen + length;
      if (end > bytes.length) throw new Error("PBLink field exceeds buffer");
      const fieldBytes = bytes.subarray(afterLen, end);
      offset = end;

      if (fieldNumber === 1) {
        hash = fieldBytes;
      } else if (fieldNumber === 2) {
        name = new TextDecoder().decode(fieldBytes);
      }
    } else if (wireType === 0) {
      // Varint
      const { value: val, next: afterVal } = readVarint(bytes, offset);
      offset = afterVal;
      if (fieldNumber === 3) {
        tsize = val;
      }
    } else {
      throw new Error(`Unsupported wire type in PBLink: ${wireType}`);
    }
  }

  if (!hash) throw new Error("PBLink missing Hash field");
  return { hash, name, tsize };
}

/** Decodes a PBNode protobuf message. */
export function decodePBNode(bytes: Uint8Array): PBNode {
  let offset = 0;
  let data: Uint8Array | undefined;
  const links: PBLink[] = [];

  while (offset < bytes.length) {
    const { value: tagWire, next } = readVarint(bytes, offset);
    offset = next;
    const fieldNumber = Number(tagWire >> 3n);
    const wireType = Number(tagWire & 7n);

    if (wireType === 2) {
      const { value: len, next: afterLen } = readVarint(bytes, offset);
      const length = Number(len);
      const end = afterLen + length;
      if (end > bytes.length) throw new Error("PBNode field exceeds buffer");
      const fieldBytes = bytes.subarray(afterLen, end);
      offset = end;

      if (fieldNumber === 1) {
        data = fieldBytes;
      } else if (fieldNumber === 2) {
        links.push(decodePBLink(fieldBytes));
      }
    } else if (wireType === 0) {
      const { next: afterVal } = readVarint(bytes, offset);
      offset = afterVal;
    } else {
      throw new Error(`Unsupported wire type in PBNode: ${wireType}`);
    }
  }

  return { data, links };
}

/** Decodes a UnixFS Data protobuf message. */
export function decodeUnixFS(bytes: Uint8Array): UnixFSData {
  let offset = 0;
  let type: UnixFSType | undefined;
  let data: Uint8Array | undefined;
  let filesize: bigint | undefined;
  const blocksizes: bigint[] = [];

  while (offset < bytes.length) {
    const { value: tagWire, next } = readVarint(bytes, offset);
    offset = next;
    const fieldNumber = Number(tagWire >> 3n);
    const wireType = Number(tagWire & 7n);

    if (wireType === 0) {
      const { value: val, next: afterVal } = readVarint(bytes, offset);
      offset = afterVal;
      if (fieldNumber === 1) {
        type = Number(val) as UnixFSType;
      } else if (fieldNumber === 3) {
        filesize = val;
      } else if (fieldNumber === 4) {
        blocksizes.push(val);
      }
    } else if (wireType === 2) {
      const { value: len, next: afterLen } = readVarint(bytes, offset);
      const length = Number(len);
      const end = afterLen + length;
      if (end > bytes.length) throw new Error("UnixFS field exceeds buffer");
      const fieldBytes = bytes.subarray(afterLen, end);
      offset = end;

      if (fieldNumber === 2) {
        data = fieldBytes;
      } else if (fieldNumber === 4) {
        // Packed repeated varints
        let pOffset = 0;
        while (pOffset < fieldBytes.length) {
          const { value: bSize, next: pNext } = readVarint(fieldBytes, pOffset);
          pOffset = pNext;
          blocksizes.push(bSize);
        }
      }
    } else {
      throw new Error(`Unsupported wire type in UnixFS Data: ${wireType}`);
    }
  }

  if (type === undefined) throw new Error("UnixFS missing Type field");
  if (type !== UnixFSType.Raw && type !== UnixFSType.File) {
    throw new Error(`Unsupported UnixFS type: ${UnixFSType[type] ?? type}`);
  }

  return { type, data, filesize, blocksizes };
}
