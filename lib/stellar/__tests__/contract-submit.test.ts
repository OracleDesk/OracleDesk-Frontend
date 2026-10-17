import { describe, expect, it, vi } from "vitest";
import { Ok, type AssembledTransaction, type Result } from "@stellar/stellar-sdk/contract";
import { submitAsContract, type RpcServerLike } from "../contract-submit";
import { UserFacingError } from "../errors";
import type { Signer } from "../clients";

describe("submitAsContract", () => {
  const traderAddress = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

  const mockContractSigner: Extract<Signer, { kind: "contract" }> = {
    kind: "contract",
    address: traderAddress,
    signAuthEntry: vi.fn().mockImplementation(async (entry) => entry),
    submit: vi.fn().mockResolvedValue({ hash: "tx_hash_123" }),
  };

  const createMockTx = (opts?: {
    result?: unknown;
    simulationError?: string;
    neededSigners?: string[];
    returnValue?: unknown;
  }) => {
    const needed = opts?.neededSigners ?? [traderAddress];
    const signAuthEntriesSpy = vi.fn().mockImplementation(async ({ authorizeEntry }: any) => {
      // Simulate calling the authorizeEntry callback
      await authorizeEntry({ rootInvocation: () => ({}) });
    });
    const simulateSpy = vi.fn().mockResolvedValue({});
    const buildSpy = vi.fn().mockReturnValue({ toXDR: () => "mock_tx_xdr" });

    const tx = {
      result: opts?.result !== undefined ? opts.result : new Ok(100n),
      simulation: opts?.simulationError ? { error: opts.simulationError } : undefined,
      needsNonInvokerSigningBy: vi.fn().mockResolvedValue(needed),
      signAuthEntries: signAuthEntriesSpy,
      simulate: simulateSpy,
      build: buildSpy,
      options: {
        parseResultXdr: (v: any) => v,
      },
    } as unknown as AssembledTransaction<Result<bigint>>;

    return { tx, signAuthEntriesSpy, simulateSpy, buildSpy };
  };

  it("refuses when needsNonInvokerSigningBy lists an unexpected address", async () => {
    const unexpectedAddress = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB2KM";
    const { tx } = createMockTx({
      neededSigners: [traderAddress, unexpectedAddress],
    });

    await expect(submitAsContract(tx, mockContractSigner, "marketCore")).rejects.toThrow(
      UserFacingError,
    );
  });

  it("refuses when needsNonInvokerSigningBy does not include trader", async () => {
    const otherAddress = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB2KM";
    const { tx } = createMockTx({
      neededSigners: [otherAddress],
    });

    await expect(submitAsContract(tx, mockContractSigner, "marketCore")).rejects.toThrow(
      UserFacingError,
    );
  });

  it("surfaces simulation failures before calling signAuthEntries or submit", async () => {
    const failingTx = {
      get result() {
        throw new Error("HostError: Error(Contract, #18)");
      },
      simulation: { error: "HostError: Error(Contract, #18)" },
      needsNonInvokerSigningBy: vi.fn(),
    } as unknown as AssembledTransaction<Result<bigint>>;

    await expect(submitAsContract(failingTx, mockContractSigner, "marketCore")).rejects.toThrow(
      UserFacingError,
    );
    expect(mockContractSigner.signAuthEntry).not.toHaveBeenCalled();
    expect(mockContractSigner.submit).not.toHaveBeenCalled();
  });

  it("signs auth entries, re-simulates, submits via relayer, and polls until SUCCESS", async () => {
    const { tx, signAuthEntriesSpy, simulateSpy, buildSpy } = createMockTx();

    let pollCount = 0;
    const mockRpcServer: RpcServerLike = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 500 }),
      getTransaction: vi.fn().mockImplementation(async () => {
        pollCount++;
        if (pollCount < 2) {
          return { status: "PENDING" } as any;
        }
        return {
          status: "SUCCESS",
          returnValue: new Ok(100n),
        } as any;
      }),
    };

    const result = await submitAsContract(tx, mockContractSigner, "marketCore", {
      rpcServer: mockRpcServer,
      pollIntervalMs: 10,
    });

    expect(signAuthEntriesSpy).toHaveBeenCalled();
    expect(simulateSpy).toHaveBeenCalled();
    expect(buildSpy).toHaveBeenCalled();
    expect(mockContractSigner.submit).toHaveBeenCalled();
    expect(mockRpcServer.getTransaction).toHaveBeenCalledWith("tx_hash_123");
    expect(result).toEqual({
      value: 100n,
      txHash: "tx_hash_123",
    });
  });
});
