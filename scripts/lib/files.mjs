// [source path under oracledesk-stellar/, destination file name]
export const FILES = [
  ["packages/bindings/market-core/src/index.ts", "market-core.ts"],
  ["packages/bindings/treasury/src/index.ts", "treasury.ts"],
  ["packages/bindings/reasoning-registry/src/index.ts", "reasoning-registry.ts"],
  ["packages/bindings/resolver/src/index.ts", "resolver.ts"],
  ["agents/core/fpmm.ts", "fpmm.ts"],
  ["deployments/testnet.json", "deployments.testnet.json"],
  ["packages/bindings/market-core/package.json", "bindings-package.json"],
];

export const CONTRACT_BINDINGS = [
  { contract: "marketCore", file: "market-core.ts", factory: "marketCore(" },
  { contract: "treasury", file: "treasury.ts", factory: "treasury(" },
  { contract: "resolver", file: "resolver.ts", factory: "resolver(" },
  { contract: "reasoningRegistry", file: "reasoning-registry.ts", factory: "reasoningRegistry(" },
];
