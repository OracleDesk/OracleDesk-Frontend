import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, getStoredSessionId, getStoredToken, onAuthInvalid, storeAuthSession, clearAuthSession } from "../client";

describe("request identity binding", () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    } });
    storeAuthSession({ token: "token-a", userId: "a", walletAddress: "GA" });
  });
  afterEach(() => { clearAuthSession(); vi.unstubAllGlobals(); });
  it("refuses a stale scope without sending a request", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(apiClient.get("/traces/t1", undefined, { expectScope: { wallet: "GA", sessionId: "old" } }))
      .rejects.toMatchObject({ code: "SCOPE_CHANGED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["INVALID_TOKEN", "TOKEN_EXPIRED", "UNAUTHORIZED"])("clears and emits for %s with a token", async (code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, error: { code, message: "Sign in" } }, { status: 401 })));
    const listener = vi.fn(); const off = onAuthInvalid(listener);
    await expect(apiClient.get("/traces/payments")).rejects.toMatchObject({ code });
    expect(getStoredToken()).toBeNull(); expect(getStoredSessionId()).toBeNull(); expect(listener).toHaveBeenCalledOnce(); off();
  });
  it("discards an old response without clearing a new session", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
    const promise = apiClient.get("/traces/t1", undefined, { expectScope: { wallet: "GA", sessionId: getStoredSessionId() } });
    storeAuthSession({ token: "token-b", userId: "b", walletAddress: "GB" });
    finish(Response.json({ ok: false, error: { code: "TOKEN_EXPIRED", message: "Expired" } }, { status: 401 }));
    await expect(promise).rejects.toMatchObject({ code: "SCOPE_CHANGED" });
    expect(getStoredToken()).toBe("token-b");
  });
});
