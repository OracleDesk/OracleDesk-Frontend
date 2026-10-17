import { describe, expect, it, vi } from "vitest";
import { Ok, Err, type AssembledTransaction, type Result } from "@stellar/stellar-sdk/contract";
import { read, submit, bytesToHex } from "../typed-call";
import { UserFacingError } from "../errors";

describe("typed-call runtime helpers", () => {
  it("read returns plain values unchanged", () => {
    const bigIntTx = { result: 42n } as unknown as AssembledTransaction<bigint>;
    expect(read(bigIntTx)).toBe(42n);

    const position = { yes: 100n, no: 200n };
    const positionTx = { result: position } as unknown as AssembledTransaction<typeof position>;
    expect(read(positionTx)).toEqual(position);

    const strTx = { result: "hello" } as unknown as AssembledTransaction<string>;
    expect(read(strTx)).toBe("hello");
  });

  it("read unwraps Ok and throws UserFacingError on Err with mapped code", () => {
    const okTx = { result: new Ok(999n) } as unknown as AssembledTransaction<Result<bigint>>;
    expect(read(okTx)).toBe(999n);

    const errTx = {
      result: new Err({ message: "HostError: Error(Contract, #18)" }),
      simulation: { error: "HostError: Error(Contract, #18)" },
    } as unknown as AssembledTransaction<Result<bigint>>;

    expect(() => read(errTx, "marketCore")).toThrow(UserFacingError);
    try {
      read(errTx, "marketCore");
    } catch (err) {
      expect(err).toBeInstanceOf(UserFacingError);
      const userErr = err as UserFacingError;
      expect(userErr.described.code).toBe("Paused");
      expect(userErr.message).toBe("Trading is paused right now. Try again later.");
    }
  });

  it("read does not treat an object with an isOk property as a Result", () => {
    const duckTyped = {
      isOk: () => true,
      unwrap: () => "duck_unwrapped",
    };
    const duckTx = { result: duckTyped } as unknown as AssembledTransaction<typeof duckTyped>;
    const res = read(duckTx);
    // Must return the plain object itself, NOT the result of .unwrap()
    expect(res).toBe(duckTyped);
    expect(res).not.toBe("duck_unwrapped");
  });

  it("read maps a throwing tx.result through describeError with the contract table", () => {
    const throwingTx = {
      get result() {
        throw new Error("HostError: Error(Contract, #25)");
      },
      simulation: { error: "HostError: Error(Contract, #25)" },
    } as unknown as AssembledTransaction<bigint>;

    expect(() => read(throwingTx, "marketCore")).toThrow(UserFacingError);
    try {
      read(throwingTx, "marketCore");
    } catch (err) {
      expect(err).toBeInstanceOf(UserFacingError);
      const userErr = err as UserFacingError;
      expect(userErr.described.code).toBe("SlippageExceeded");
      expect(userErr.message).toBe("The price moved before your trade went through. Try again or allow more slippage.");
    }
  });

  it("submit surfaces simulation failure before calling signAndSend", async () => {
    const signAndSendSpy = vi.fn();
    const failingTx = {
      get result() {
        throw new Error("HostError: Error(Contract, #20)");
      },
      simulation: { error: "HostError: Error(Contract, #20)" },
      signAndSend: signAndSendSpy,
    } as unknown as AssembledTransaction<bigint>;

    await expect(submit(failingTx, "marketCore")).rejects.toThrow(UserFacingError);
    expect(signAndSendSpy).not.toHaveBeenCalled();
  });

  it("submit returns txHash from sendTransactionResponse", async () => {
    const successTx = {
      result: new Ok(12345n),
      signAndSend: vi.fn().mockResolvedValue({
        result: new Ok(12345n),
        sendTransactionResponse: { hash: "test_tx_hash_abc123" },
      }),
    } as unknown as AssembledTransaction<Result<bigint>>;

    const response = await submit(successTx);
    expect(response).toEqual({
      value: 12345n,
      txHash: "test_tx_hash_abc123",
    });
  });

  it("submit handles plain values and null txHash when response is missing", async () => {
    const plainTx = {
      result: 42n,
      signAndSend: vi.fn().mockResolvedValue({
        result: 42n,
        sendTransactionResponse: undefined,
      }),
    } as unknown as AssembledTransaction<bigint>;

    const response = await submit(plainTx);
    expect(response).toEqual({
      value: 42n,
      txHash: null,
    });
  });

  it("bytesToHex converts Uint8Array or Buffer to lowercase hex", () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x09]);
    expect(bytesToHex(bytes)).toBe("deadbeef0109");
  });
});
