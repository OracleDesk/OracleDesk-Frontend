import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletProvider, useWallet } from "../WalletProvider";
import type { WalletKitAdapter } from "../wallet-kit-adapter";
import { useUserScope, type UserScope } from "@/lib/query/scope";
import { userKeys } from "@/lib/query/keys";
import { useUnlockTrace } from "@/lib/hooks/useTraces";
import { apiClient, clearAuthSession, getStoredSessionWallet, storeAuthSession } from "@/lib/api/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../tx-tracker", () => ({ TransactionTrackerProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../ledger-invalidation", () => ({ LedgerInvalidator: class { start() { return () => {}; } } }));
vi.mock("@/lib/notifications/push", () => ({ storedPushWallet: () => null, unsubscribe: async () => {} }));
vi.mock("@/lib/api/cross-tab-sync", () => ({ broadcastWalletDisconnect: vi.fn(), createCrossTabSync: () => ({ unsubscribe() {} }) }));
vi.mock("@/lib/api/auth", async (original) => ({
  ...await original<typeof import("@/lib/api/auth")>(),
  signInWithWallet: async (address: string) => {
    storeAuthSession({ token: `token-${address}`, userId: address, walletAddress: address });
    return { walletAddress: address };
  },
}));

describe("provider user-scope transitions", () => {
  let update!: (payload: { address: string | null; passphrase: string | null }) => void;
  let client: QueryClient; let scope: UserScope;
  let wallet: ReturnType<typeof useWallet>; let unlock: ReturnType<typeof useUnlockTrace>;
  let kit: WalletKitAdapter;
  function Consumer() {
    client = useQueryClient(); scope = useUserScope(); wallet = useWallet(); unlock = useUnlockTrace();
    const trace = useQuery({ queryKey: userKeys.trace(scope, "t1"), enabled: false, queryFn: async () => "preview" });
    return <div>{trace.data ?? "empty"} {unlock.isPending ? "pending" : "idle"}</div>;
  }
  beforeEach(() => {
    localStorage.clear();
    storeAuthSession({ token: "token-a", userId: "a", walletAddress: "GA" });
    kit = {
      getAddress: async () => ({ address: "GA" }), getNetwork: async () => ({ networkPassphrase: "Test SDF Network ; September 2015" }),
      authModal: async () => ({ address: "GA" }), signTransaction: vi.fn(), disconnect: async () => {},
      onStateUpdated: (cb) => { update = cb; return () => {}; }, onDisconnect: () => () => {},
    };
  });
  afterEach(() => { cleanup(); clearAuthSession(); vi.unstubAllGlobals(); });
  async function setup() {
    render(<WalletProvider kitLoader={async () => kit}><Consumer /></WalletProvider>);
    await waitFor(() => expect(scope.wallet).toBe("GA"));
    const old = scope;
    act(() => {
      client.setQueryData(userKeys.allowance(old), { dailyLimit: 99 });
      client.setQueryData(userKeys.trace(old, "t1"), "secret-a");
      client.setQueryData(["markets", {}], "public");
    });
    await screen.findByText(/secret-a/);
    return old;
  }
  it.each(["disconnect", "account-change", "token-invalid", "signed-in"] as const)("removes old data on %s", async (reason) => {
    const old = await setup();
    if (reason === "disconnect") await act(() => wallet.disconnect());
    if (reason === "account-change") act(() => update({ address: "GB", passphrase: null }));
    if (reason === "signed-in") {
      act(() => update({ address: "GB", passphrase: null }));
      await act(() => wallet.ensureSession());
      expect(scope.wallet).toBe("GB"); expect(scope.sessionId).not.toBeNull();
    }
    if (reason === "token-invalid") {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, error: { code: "INVALID_TOKEN", message: "Expired" } }, { status: 401 })));
      await act(async () => { await apiClient.get("/traces/payments").catch(() => {}); });
      expect(wallet.isAuthenticated).toBe(false);
    }
    expect(client.getQueryData(userKeys.allowance(old))).toBeUndefined();
    expect(client.getQueryData(userKeys.trace(old, "t1"))).toBeUndefined();
    expect(screen.queryByText(/secret-a/)).toBeNull();
    expect(client.getQueryData(["markets", {}])).toBe("public");
  });
  it("resets pending mutations and discards late unlock results", async () => {
    await setup(); let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
    let result!: Promise<unknown>;
    act(() => { result = unlock.mutateAsync({ traceId: "t1", txHash: "hash", amountRaw: "1" }).catch((error) => error); });
    await waitFor(() => expect(unlock.isPending).toBe(true));
    act(() => update({ address: "GB", passphrase: null }));
    await waitFor(() => expect(unlock.isPending).toBe(false));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    finish(Response.json({ ok: true, data: { trace: "secret-a" } }));
    await act(async () => { expect(await result).toMatchObject({ staleScope: true }); });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it.each([null, "GB"])("clears a persisted session when restoration yields %s", async (restored) => {
    kit.getAddress = async () => { if (!restored) throw new Error("No wallet"); return { address: restored }; };
    render(<WalletProvider kitLoader={async () => kit}><Consumer /></WalletProvider>);
    await waitFor(() => expect(getStoredSessionWallet()).toBeNull());
    expect(scope.sessionId).toBeNull(); expect(scope.wallet).toBe(restored);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, data: "preview" })));
    await expect(apiClient.get("/traces/t1", undefined, { expectScope: scope })).resolves.toMatchObject({ data: "preview" });
  });
  it("does not clear a restored matching session on repeated kit notifications", async () => {
    const old = await setup(); act(() => update({ address: "GA", passphrase: null }));
    expect(scope).toBe(old); expect(client.getQueryData(userKeys.trace(old, "t1"))).toBe("secret-a");
  });
});
