import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ScopeChangedError } from "@/lib/query/scope";
import { readOutbox, reconcileEntry, refreshOutbox, RETENTION_MS, retryDelay, updateOutbox, writeOutbox, type OutboxEntry } from "@/lib/copy-trade/outbox";
import { buyCheck, trader } from "./copy-trade-fixture";

const entry = (): OutboxEntry => ({ copyTradeId: "copy-1", traceId: "t1", marketId: "m1", onChainMarketId: "7", outcome: "Yes", collateralInRaw: "10000000", state: "signed", txHash: "a".repeat(64), attempts: 0, nextAttemptAt: 0, createdAt: Date.now() });
describe("copy-trade outbox", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    const map = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => map.set(key, value) } });
    refreshOutbox(trader);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); refreshOutbox(trader); });
  const deps = () => ({ now: Date.now, sessionId: "session-a", check: vi.fn().mockResolvedValue(buyCheck()), confirm: vi.fn().mockResolvedValue({}), assertCurrent: vi.fn() });
  it("uses capped exponential backoff across reloads", async () => {
    const d = deps(); d.check.mockResolvedValue({ kind: "not-found" }); let e = entry();
    for (let attempt = 0; attempt < 10; attempt++) {
      e = await reconcileEntry(e, trader, d);
      expect(e.attempts).toBe(attempt + 1); expect(e.nextAttemptAt - Date.now()).toBe(retryDelay(attempt));
      writeOutbox(trader, [e]); refreshOutbox(trader); e = readOutbox(trader)[0];
      vi.setSystemTime(e.nextAttemptAt);
    }
    expect(retryDelay(99)).toBe(600000); expect(d.confirm).not.toHaveBeenCalled();
  });
  it.each(["TOKEN_EXPIRED", "INVALID_TOKEN", "UNAUTHORIZED"])("pauses on %s until a fresh session exists", async (code) => {
    const d = deps(); d.confirm.mockRejectedValueOnce(new ApiError({ code, message: "Expired" }, 401));
    const paused = await reconcileEntry(entry(), trader, d); expect(paused.needsSession).toBe(true);
    vi.advanceTimersByTime(600000);
    expect(await reconcileEntry(paused, trader, d)).toBe(paused); expect(d.confirm).toHaveBeenCalledOnce();
    const done = await reconcileEntry(paused, trader, { ...d, sessionId: "session-b" });
    expect(done.state).toBe("confirmed"); expect(d.confirm).toHaveBeenCalledTimes(2);
  });
  it("abandons unverifiable entries at the retention horizon", async () => {
    const e = entry(); vi.advanceTimersByTime(RETENTION_MS);
    const d = deps(); const next = await reconcileEntry(e, trader, d);
    expect(next.state).toBe("abandoned"); expect(d.check).not.toHaveBeenCalled(); expect(d.confirm).not.toHaveBeenCalled();
  });
  it("never confirms failed or mismatched transactions", async () => {
    const d = deps(); d.check.mockResolvedValueOnce(buyCheck({ amount: 1n }));
    expect((await reconcileEntry(entry(), trader, d)).state).toBe("mismatch");
    d.check.mockResolvedValueOnce({ kind: "failed", resultCode: "txFailed" });
    expect((await reconcileEntry(entry(), trader, d)).state).toBe("abandoned"); expect(d.confirm).not.toHaveBeenCalled();
  });
  it("abandons a missing backend intent", async () => {
    const d = deps(); d.confirm.mockRejectedValue(new ApiError({ code: "COPY_TRADE_NOT_FOUND", message: "Gone" }, 404));
    expect((await reconcileEntry(entry(), trader, d)).state).toBe("abandoned");
  });
  it("does not confirm after the account changes during the chain check", async () => {
    const d = deps(); d.assertCurrent.mockImplementationOnce(() => {}).mockImplementation(() => { throw new ScopeChangedError(); });
    const e = entry(); expect(await reconcileEntry(e, trader, d)).toBe(e); expect(d.confirm).not.toHaveBeenCalled();
  });
  it("retains a missing hash for manual inspection without guessing", async () => {
    const d = deps(); const e = { ...entry(), txHash: null };
    expect(await reconcileEntry(e, trader, d)).toBe(e); expect(d.check).not.toHaveBeenCalled();
  });
  it("survives blocked storage with an in-memory fallback", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("Blocked"); } });
    refreshOutbox(trader); expect(readOutbox(trader)).toEqual([]);
    expect(writeOutbox(trader, [entry()])).toBe(false); expect(readOutbox(trader)).toHaveLength(1);
  });
  it("never replaces a saved hash or regresses a confirmed record", () => {
    writeOutbox(trader, [entry()]); updateOutbox(trader, "copy-1", { txHash: "b".repeat(64) });
    expect(readOutbox(trader)[0].txHash).toBe("a".repeat(64));
    updateOutbox(trader, "copy-1", { state: "confirmed" }); updateOutbox(trader, "copy-1", { state: "signed" });
    expect(readOutbox(trader)[0].state).toBe("confirmed");
  });
  it("prunes terminal entries first and caps storage at fifty", () => {
    const entries = Array.from({ length: 51 }, (_, i) => ({ ...entry(), copyTradeId: String(i), state: i === 0 ? "confirmed" as const : "signed" as const }));
    expect(writeOutbox(trader, entries)).toBe(true); expect(readOutbox(trader)).toHaveLength(50); expect(readOutbox(trader)[0].copyTradeId).toBe("1");
  });
});
