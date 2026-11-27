# OracleDesk Frontend

OracleDesk is an AI prediction-market terminal. Agents propose markets and trade them on Stellar, and every decision ships with a reasoning trace whose hash is recorded on-chain so anyone can check it. This repo is the Next.js web app. It reads the Soroban contracts directly for prices, positions and balances, signs trades with the user's own wallet, and uses the backend for market metadata, traces, login and subscriptions.

> **Testnet only, unaudited.** See [docs/STATUS.md](docs/STATUS.md) for what is verified.

## How the three repos fit

| Repo | Role |
|---|---|
| [OracleDesk-SmartContract](https://github.com/OracleDesk/OracleDesk-SmartContract) | Soroban contracts (`market-core`, `treasury`, `resolver`, `reasoning-registry`), generated TypeScript bindings, testnet deployment, the x402 trace service. **Source of truth.** Pinned here as the `contracts` submodule. |
| [OracleDesk-Backend](https://github.com/OracleDesk/OracleDesk-Backend) | API, event indexer and LLM pipeline. Wallet login, market and trace metadata, subscriptions, agent trades through the treasury. |
| **OracleDesk-Frontend** (this repo) | Web app. |

```mermaid
flowchart LR
  user([User + Stellar wallet]) -->|connect, sign| fe[Frontend<br/>Next.js]
  fe -->|REST + socket.io<br/>docs/api.md| be[Backend<br/>Express + Postgres]
  fe -->|simulate reads,<br/>signed buys/sells/transfers| rpc[(Stellar RPC<br/>testnet)]
  be -->|reads, getEvents,<br/>agent writes via treasury| rpc
  rpc --- mc[market-core]
  rpc --- tr[treasury]
  rpc --- rs[resolver]
  rpc --- rr[reasoning-registry]
  rpc --- usdc[USDC SAC]
  fe -->|per-trace unlock| x402[x402 trace service<br/>contracts repo]
  fe -->|fetch + hash-check traces| ipfs[(IPFS gateway)]
```

More detail in [docs/architecture.md](docs/architecture.md).

## Prerequisites

- Node.js 22 LTS (`.nvmrc`; Next.js 16 needs 20.9 or later). Built and tested here with Node 24.13.1 and npm 11.8.0; CI uses Node 22.
- npm 10 or later.
- A Stellar wallet browser extension, e.g. [Freighter](https://www.freighter.app/), set to **Testnet**.
- A running [backend](https://github.com/OracleDesk/OracleDesk-Backend) for anything beyond on-chain reads.

## Quick start

```bash
git clone --recurse-submodules https://github.com/OracleDesk/OracleDesk-Frontend.git
cd OracleDesk-Frontend
git submodule update --init      # if you cloned without --recurse-submodules
nvm use
npm ci
npm run sync:bindings            # no-op unless the submodule moved
cp .env.example .env.local       # point NEXT_PUBLIC_API_URL at your backend
npm run dev                      # http://localhost:3000
```

To trade on testnet you need XLM and test USDC; follow [docs/manual-test.md](docs/manual-test.md).

## Configuration

All variables are listed and explained in [.env.example](.env.example). Everything defaults to Stellar Testnet and the contract ids in the synced deployments file. Every `NEXT_PUBLIC_*` value is compiled into browser JavaScript, so never put a secret in one.

Configuration is validated at startup and before `next build`: contract ids and recipients are StrKey-checked, URLs must be https (except localhost) with no credentials, query or fragment, the RPC must match the passphrase, and `NEXT_PUBLIC_API_URL` is required for production builds (it must end with `/api/v1`). `npm run check:env` fails if the code and `.env.example` disagree.

**Mobile wallets (WalletConnect).** Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to show WalletConnect in the connect modal, so phone wallets such as LOBSTR or Freighter Mobile can pair with a QR code. The kit and WalletConnect load only when this is set, behind a dynamic import, so pages that don't need them are unchanged. Set `NEXT_PUBLIC_APP_URL` to the deployed origin and allow that origin in the WalletConnect Cloud project.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest `unit` (node) and `dom` (jsdom) projects over `lib`, `components`, `app` and `scripts` |
| `npm run e2e:testnet` | Optional read-only check against a running backend and live testnet |
| `npm run sync:bindings` | Copy generated contract code from `contracts/` into `lib/stellar/generated/` |
| `npm run check:bindings` | Fail if `lib/stellar/generated/` is stale (CI runs this) |
| `npm run test:props` | Long fast-check run of the FPMM property tests |
| `npm run test:mutation` | Stryker mutation run plus the score check |
| `npm run test:coverage` | Vitest with coverage |
| `npm run test:api-contract` | API contract tests (`vitest.contract.config.mts`) |
| `npm run fixtures:record` / `npm run fixtures:check` | Record or verify recorded fixtures |
| `npm run check:api-doc` | Check `docs/api.md` against the code |
| `npm run check:api-errors` | Check the API error code list (CI runs this) |
| `npm run check:env` | Fail if `.env.example` and the code disagree (CI runs this) |
| `npm run check:sdk` | Check the Stellar SDK major version (CI runs this) |
| `npm run check:origins` | Check external origins against the allowlist (CI runs this) |
| `npm run check:docs` | Fail if the docs reference npm scripts or script files that do not exist (CI runs this) |
| `npm run i18n:check` | Validate message catalogs: ICU syntax, key parity with `en.json`, unused keys, stale generated types (CI runs this) |
| `npm run i18n:types` | Regenerate the typed message arguments after editing `en.json` |
| `npm run i18n:pseudo` | Regenerate the `en-XA` pseudo-locale catalog |
| `npm run scan:secrets` | Scan the build output for secrets (CI runs this) |
| `npm run install:allowed-scripts` | Run the allow-listed dependency install scripts |
| `npm run perf:lhci` | Lighthouse CI budgets |

## Project structure

```
app/                    Next.js App Router pages
components/             Layout and UI components
lib/api/                Backend REST client (envelope + JWT), typed per docs/api.md
lib/hooks/useStellar.ts React Query hooks for on-chain reads and writes
lib/stellar/            Config, units (7-decimal USDC as bigint), binding clients,
                        error messages, trace hash checks, wallet provider
lib/stellar/generated/  Copied from the contracts submodule. Do not edit.
contracts/              OracleDesk-SmartContract submodule (pinned)
scripts/                sync-bindings.mjs
e2e/                    Opt-in testnet checks
docs/                   API contract, architecture, reproducible build guide, porting notes, status, backlog
See [docs/reproducible-build.md](docs/reproducible-build.md) for deterministic static builds and verification.
```

## Deployed testnet contracts

From `lib/stellar/generated/deployments.testnet.json` (contracts commit `eb5f3fd`):

| Contract | Id |
|---|---|
| market-core | `CC4MMHWZ6ZRYAOQRR42KIIWNEZNFM4CWQ5Y4NNWTWNRUYH2O7E3SRK2O` |
| treasury | `CBTFA3EPQ63PL5XXHOMU4LRDCAB2MHKOLEPDQI7E7TNK454YNBOMZLYB` |
| resolver | `CDDJU3PH6T3Z4O6EYLALXXB5XBFPYO2G5P5RBDEIZ7ZVN6V37OQSVYGR` |
| reasoning-registry | `CAFEED35XICK4OXIEXQDS6KTTBUA2LDNW3EXEUGTNMN54DY5ANETCH6M` |
| USDC (self-issued test asset, SAC) | `CA2WQQJ4OHQCLHQW6XN4BCLILGRV6V4YDYDT3GVIWXB53BTOO7EMREQH` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), including how to pick up a Drips Wave issue. Security reports: [SECURITY.md](SECURITY.md). License: [MIT](LICENSE).
