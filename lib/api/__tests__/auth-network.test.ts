import { afterEach, describe, expect, it, vi } from "vitest";
import { signInWithWallet } from "../auth";
import { apiClient } from "../client";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import { describeError } from "@/lib/stellar/errors";

afterEach(() => vi.restoreAllMocks());
describe("sign-in challenge network", () => {
  it("refuses a different passphrase before asking the wallet", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: { transaction: "invalid", networkPassphrase: "mainnet", expiresAt: "later" } });
    const sign = vi.fn();
    const error = await signInWithWallet("GA", sign).catch((e) => e);
    expect(describeError(error)).toMatchObject({ kind: "wrong-network", message: expect.stringContaining("Sign-in is disabled") });
    expect(sign).not.toHaveBeenCalled();
  });
  it("refuses invalid XDR before asking the wallet", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: { transaction: "invalid", networkPassphrase: NETWORK_PASSPHRASE, expiresAt: "later" } });
    const sign = vi.fn();
    await expect(signInWithWallet("GA", sign)).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
  });
});
