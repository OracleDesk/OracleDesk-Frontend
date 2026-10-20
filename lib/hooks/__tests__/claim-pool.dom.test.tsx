import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeLpMarket, creator } from "@/lib/stellar/__tests__/fixtures/lp-market";
import { useClaimPoolRemainder, stellarKeys } from "../useStellar";

const mocks = vi.hoisted(() => ({ getMarket: vi.fn(), claim: vi.fn(), sign: vi.fn(), send: vi.fn(), getTransaction: vi.fn() }));
vi.mock("@/lib/contexts/WalletContext", () => ({
  useWalletSigner: () => ({ publicKey: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", signTransaction: vi.fn() }),
  useWalletAddress: () => ({ address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" }),
  useWalletNetwork: () => ({ isWrongNetwork: false, walletNetwork: { state: "match" }, rpcNetwork: { status: "ok" }, networkEpoch: 0, assertNetworkCurrent: vi.fn() }),
}));
vi.mock("@/lib/stellar/clients", () => ({
  marketCore: () => ({ spec: {}, get_market: mocks.getMarket, claim_pool_remainder: mocks.claim }),
  rpcServer: () => ({ sendTransaction: mocks.send, getTransaction: mocks.getTransaction }),
  currentRpcUrl: () => "http://localhost", rpcPool: () => null, withPinnedRpc: (run: (url: string) => unknown) => run("http://localhost"),
  token: {}, Outcomes: {}, reasoningRegistry: vi.fn(),
}));
vi.mock("@/lib/stellar/market-batch", () => ({ createMarketBatcher: () => ({}) }));
vi.mock("@/lib/stellar/submit-queue", () => ({ getSubmitQueue: () => ({ enqueue: (job: { run: (context: { attempt: number; signal: AbortSignal }) => unknown }) => job.run({ attempt: 0, signal: new AbortController().signal }) }) }));
vi.mock("@/lib/pwa/update-context", () => ({ useUpdatePending: () => false }));

describe("fresh creator-claim guard", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  beforeEach(() => {
    vi.clearAllMocks(); client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    mocks.getMarket.mockResolvedValue({ result: makeLpMarket({ status: { tag: "Void", values: undefined } }), simulation: { latestLedger: 100 } });
  });
  it.each([
    ["AlreadyClaimed", makeLpMarket({ lp_claimed: true, reserve_yes: 0n, reserve_no: 0n, status: { tag: "Void", values: undefined } })],
    ["NotFinal", makeLpMarket()],
  ])("refuses %s before building or signing", async (code, market) => {
    mocks.getMarket.mockResolvedValue({ result: market, simulation: { latestLedger: 100 } });
    const hook = renderHook(() => useClaimPoolRemainder(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ marketId: "7" })).rejects.toMatchObject({ described: { code } }); });
    expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("refuses another creator before signing", async () => {
    mocks.getMarket.mockResolvedValue({ result: makeLpMarket({ creator: "GOTHER" }), simulation: { latestLedger: 100 } });
    const hook = renderHook(() => useClaimPoolRemainder(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ marketId: "7" })).rejects.toThrow(/Only this market's creator/); });
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("signs and submits a fresh final claim and invalidates market, position and balance", async () => {
    const { nativeToScVal } = await import("@stellar/stellar-sdk");
    mocks.claim.mockResolvedValue({ result: 1000000000n, simulation: {}, sign: mocks.sign,
      signed: { hash: () => Buffer.from("a".repeat(64), "hex") } });
    mocks.sign.mockResolvedValue(undefined); mocks.send.mockResolvedValue({ status: "PENDING" });
    mocks.getTransaction.mockResolvedValue({ status: "SUCCESS", ledger: 101, returnValue: nativeToScVal(1000000000n, { type: "i128" }) });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const hook = renderHook(() => useClaimPoolRemainder(), { wrapper });
    await act(async () => { const result = await hook.result.current.mutateAsync({ marketId: "7" }); expect(result.payout).toBe(1000000000n); });
    expect(mocks.claim).toHaveBeenCalledWith({ market_id: 7n }); expect(mocks.sign).toHaveBeenCalledOnce(); expect(mocks.send).toHaveBeenCalledOnce();
    for (const key of [stellarKeys.market("7"), stellarKeys.position("7", creator), stellarKeys.balance(creator)]) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  });
});
