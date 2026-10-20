import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserScopeContext, UserScopeStore } from "@/lib/query/scope";
import { readOutbox, refreshOutbox } from "@/lib/copy-trade/outbox";
import { CONTRACTS } from "@/lib/stellar/config";
import { trader } from "./copy-trade-fixture";
import { useCopyTrade } from "../useCopyTrade";

const mocks = vi.hoisted(() => ({ buy: vi.fn(), initiate: vi.fn(), wallet: { address: "", ensureSession: vi.fn().mockResolvedValue(true) } }));
vi.mock("@/lib/contexts/WalletContext", () => ({ useWallet: () => mocks.wallet }));
vi.mock("../useStellar", () => ({ useBuy: () => ({ mutateAsync: mocks.buy, phase: { name: "building" }, isPending: false }) }));
vi.mock("@/lib/api/trade", () => ({ initiateCopyTrade: mocks.initiate, confirmCopyTrade: vi.fn() }));

describe("copy-trade intent persistence", () => {
  let store: UserScopeStore;
  const input = { traceId: "t1", backendMarketId: "m1", marketId: "7", outcome: "Yes" as const, collateralIn: 10000000n, slippageBps: 100 };
  const result = { txHash: "a".repeat(64), sharesOut: 2n };
  beforeEach(() => {
    localStorage.clear(); refreshOutbox(trader); vi.clearAllMocks();
    mocks.wallet.address = trader; mocks.wallet.ensureSession.mockResolvedValue(true);
    store = new UserScopeStore(new QueryClient()); store.resetUserScope({ wallet: trader, sessionId: "session-a" }, "signed-in");
    mocks.initiate.mockResolvedValue({ copyTradeId: "copy-1", transactionPayload: { contractId: CONTRACTS.marketCore, onChainMarketId: "7", outcome: "Yes", collateralInRaw: "10000000", userWallet: trader } });
  });
  afterEach(() => { refreshOutbox(trader); });
  const wrapper = ({ children }: { children: React.ReactNode }) => <UserScopeContext.Provider value={store}>{children}</UserScopeContext.Provider>;
  it("persists the intent before signing and the hash before submission", async () => {
    mocks.buy.mockImplementation(async ({ onSigned }) => {
      expect(readOutbox(trader)[0].state).toBe("initiated");
      onSigned(result.txHash); expect(readOutbox(trader)[0].txHash).toBe(result.txHash);
      return result;
    });
    const hook = renderHook(() => useCopyTrade(), { wrapper });
    await act(async () => { await hook.result.current.run(input); });
    expect(readOutbox(trader)[0]).toMatchObject({ state: "signed", txHash: result.txHash, collateralInRaw: "10000000" });
    refreshOutbox(trader); expect(readOutbox(trader)[0].txHash).toBe(result.txHash);
  });
  it("abandons a rejected unsigned intent", async () => {
    mocks.buy.mockRejectedValue({ code: -4, message: "User rejected" });
    const hook = renderHook(() => useCopyTrade(), { wrapper });
    await act(async () => { await hook.result.current.run(input).catch(() => {}); });
    expect(readOutbox(trader)[0]).toMatchObject({ state: "abandoned", txHash: null });
  });
  it("keeps an already signed trade recoverable after an account switch", async () => {
    mocks.buy.mockImplementation(async ({ onSigned }) => {
      onSigned(result.txHash); store.resetUserScope({ wallet: "GB", sessionId: null }, "account-change"); return result;
    });
    const hook = renderHook(() => useCopyTrade(), { wrapper });
    await act(async () => { await expect(hook.result.current.run(input)).rejects.toMatchObject({ staleScope: true }); });
    expect(readOutbox(trader)[0]).toMatchObject({ state: "signed", txHash: result.txHash });
    expect(readOutbox("GB")).toEqual([]);
  });
});
