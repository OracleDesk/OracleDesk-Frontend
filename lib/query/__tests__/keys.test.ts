import { describe, expect, it } from "vitest";
import { publicKeys, userKeys } from "../keys";
import { scopeKey } from "../scope";

describe("backend key scopes", () => {
  const scope = { wallet: "GA", sessionId: "session-a" };
  it("all user keys start with the wallet/session segment", () => {
    for (const key of [userKeys.root(scope), userKeys.trace(scope, "t1"), userKeys.traces(scope, {}),
      userKeys.infiniteTraces(scope, {}), userKeys.allowance(scope), userKeys.payments(scope),
      userKeys.positions(scope, {}), userKeys.portfolio(scope), userKeys.marketGeneration(scope, "j1"), userKeys.x402Journal(scope, "testnet", scope.wallet)]) {
      expect(key.slice(0, 3)).toEqual(scopeKey(scope));
    }
  });
  it("public keys remain unscoped", () => {
    for (const key of [publicKeys.markets({}), publicKeys.market("m1"), publicKeys.platformStats]) expect(key).not.toContain("scope");
  });
  it("anonymous and fresh sessions have distinct keys", () => {
    expect(userKeys.trace(scope, "t1")).not.toEqual(userKeys.trace({ ...scope, sessionId: "session-b" }, "t1"));
    expect(scopeKey({ wallet: null, sessionId: null })).toEqual(["scope", "-", "-"]);
  });
});
