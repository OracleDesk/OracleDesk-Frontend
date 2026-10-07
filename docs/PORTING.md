# Porting inventory: Arc (EVM) → Stellar (Soroban)

This lists every file in this repo that touched EVM, Arc, Polygon, Circle,
Polymarket or CCTP when the port started, and what happens to it. It was
built from

```bash
grep -rliE "wagmi|viem|ethers|@reown|rainbowkit|circle|polymarket|cctp|\barc\b|0x[0-9a-fA-F]{40}|polygon|metamask|phantom|solana|\bETH\b|gasless" app components lib
```

and then by reading each file (grep alone over-reports: `check_circle` is a
Material icon name, `<circle>` is SVG).

The contracts in `contracts/oracledesk-stellar` are the source of truth. The
frontend adapts to them.

## Delete

| File | Why |
|---|---|
| `lib/web3/abis.json` | Arc/Polygon Solidity ABIs. No equivalent on Soroban; the generated bindings carry the contract spec. |
| `lib/web3/chains.ts` | Arc testnet / Polygon Amoy chain definitions. |
| `lib/web3/contracts.ts` | EVM contract addresses, ABIs, 6-decimal USDC helpers. Replaced by `lib/stellar/config.ts`, `units.ts`, `clients.ts`. |
| `lib/web3/polymarket.ts` | Polymarket EIP-712 order signing. Polymarket is out of scope on Stellar. |
| `lib/web3/wagmi.config.ts` | wagmi + Reown AppKit config. |
| `lib/web3/Web3Provider.tsx` | wagmi provider; replaced by `lib/stellar/WalletProvider.tsx`. |
| `lib/web3/useWallet.ts` | wagmi wallet hook; replaced by `useWallet()` from the Stellar provider. |
| `lib/web3/index.ts` | Types for the above (EVM wallet names, Polymarket order payloads). |
| `lib/hooks/useOracleDesk.ts` | wagmi `useReadContract` hooks against Arc. Replaced by `lib/hooks/useStellar.ts`. |
| `lib/hooks/useCopyTrade.ts` | Polymarket CTF order flow on Polygon. |
| `lib/types/appkit.d.ts` | Reown AppKit element typings. |
| `components/modals/ConnectWalletModal.tsx` | Never mounted anywhere; Stellar Wallets Kit has its own picker. |
| `global.d.ts` | Only declares `wui-*` Reown web components. |

## Rewrite

| File | What changes |
|---|---|
| `package.json` | Drop `wagmi`, `viem`, `@reown/*`, `@rainbow-me/rainbowkit`. Add `@stellar/stellar-sdk` (major matches the bindings, `^16`), `@creit.tech/stellar-wallets-kit`, `buffer`. Add `typecheck`, `test`, `sync:bindings`, `check:bindings`. |
| `next.config.ts` | `serverExternalPackages` only existed for wagmi/WalletConnect deps (`pino-pretty`, `lokijs`, `encoding`). |
| `lib/contexts/WalletContext.tsx` | Re-export the Stellar provider and hook. |
| `app/layout.tsx` | Remove the `headers()`/cookie plumbing that existed only for wagmi SSR hydration. |
| `components/layout/WalletDropdown.tsx` | AppKit views → "Copy address" and "View on Stellar Expert"; network label from the wallet's passphrase; real USDC balance from the SAC. |
| `app/copy-trade/page.tsx` | Arc `approve` + `buy` → `market_core.buy` through `useBuy`. Fix hardcoded `$42,000` bankroll, `minSharesOut: 0`, silent YES default, fake CCTP `setTimeout`, MEV toggle wired to nothing. |
| `app/premium/page.tsx` | ERC-20 `transfer` on Arc → SEP-41 `transfer` on the USDC SAC, then backend unlock with the tx hash. |
| `app/portfolio/wallets/page.tsx` | Real Stellar USDC balance; remove fake Solana/Phantom log lines. |
| `app/admin/page.tsx` | Admin allowlist from `lib/stellar/config.ts`, compared case-sensitively (G-addresses are uppercase; the old code lowercased). |
| `app/admin/create/page.tsx` | `connect()` no longer exists → `openModal()`. Category picker driven by the backend categories mapped onto the contract `Category` enum. |
| `app/reasoning/verify/page.tsx` | Replace the scripted "Arc ReasoningRegistry" log lines with a real hash check (`useVerifiedTrace`). Link to Stellar Expert instead of arcscan. Needs a `<Suspense>` boundary for `useSearchParams`. |
| `app/markets/page.tsx` | "Arc Native / Polygon/Poly" badge and `formatUsdc` from `lib/web3`. Join backend markets to on-chain data. |
| `app/markets/quick-view/page.tsx` | Known prerender failure: `useSearchParams()` outside `<Suspense>`. |
| `app/page.tsx` | Arc/Polygon/CCTP/paymaster copy in the mock activity feeds. |
| `app/notifications/page.tsx` | "Arc Testnet" copy and an Arc explorer link for tx hashes. |
| `app/portfolio/page.tsx` | "EURC treasury (Arc)" and "Arc testnet" labels. |
| `app/stats/page.tsx`, `app/settings/page.tsx`, `app/transaction-*/page.tsx`, `app/markets/terminal/page.tsx`, `app/wallet-demo/page.tsx` | ETH / gas / Solana copy inside mock data. Labelled as demo data rather than replaced with new fake numbers. |
| `lib/api/auth.ts` | `/auth/connect` (bare address, no proof) → `/auth/challenge` + `/auth/verify`. |
| `lib/api/markets.ts` | `onChainAddress` → `onChainMarketId` (decimal string). `EURC` removed from `SettlementCurrency`. |
| `lib/api/trade.ts` | Copy-trade payload no longer carries a Polymarket builder code or EVM token address. |
| `README.md` | Rewritten for Stellar; emoji page list removed. |

## Keep (no chain coupling)

`lib/api/client.ts`, `lib/api/portfolio.ts`, `lib/api/traces.ts`,
`lib/hooks/useMarkets.ts`, `lib/hooks/usePortfolio.ts`, `lib/hooks/useTraces.ts`,
`lib/utils.ts`, `components/layout/Navbar.tsx`, `components/layout/Footer.tsx`,
`components/ui/*`, and the pages that only render mock data with no chain
copy (`reasoning/*` except `verify`, `portfolio/analytics`, `market`,
`execution-terminal`, `buy-*-demo`).

## Repo plumbing

| Item | Decision |
|---|---|
| `OracleDesk-Backend` submodule | **Removed.** Its recorded commit (`207464d`) was never pushed, which broke `git clone --recurse-submodules`. The frontend reaches the backend over HTTP only. |
| `contracts` submodule | Bumped to `OracleDesk-SmartContract` HEAD. Generated code is copied out of it by `scripts/sync-bindings.mjs` into `lib/stellar/generated/`, so the build never imports from the submodule directly. |
| `raw_ticker.txt`, `recovered_page.tsx.txt` | Deleted; nothing referenced them. |
| `CLAUDE.md` | Already a one-line `@AGENTS.md` pointer; kept. |
