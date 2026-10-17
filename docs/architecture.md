# Frontend architecture

## Where data comes from

The frontend has two sources that can disagree, and it says which one a value came from (the small `chain` / `backend` tags in the UI).

| Data | Source | Why |
|---|---|---|
| Prices, reserves, market status, positions, USDC balance | **Chain**, via simulated contract calls (`lib/hooks/useStellar.ts`) | The contract is the truth; the backend's copy can lag. |
| Question text, category, reasoning traces (metadata), subscriptions, platform counts | **Backend** (`lib/api/*`, `docs/api.md`) | Not stored on-chain in readable form. |
| Trace content | **IPFS**, then hash-checked against `reasoning_registry.get_trace` | Gateways are not authenticated; content is shown only if its sha256 matches the chain (`lib/stellar/trace.ts`). |

A backend market links to the chain through `onChainMarketId` (market-core's `u64` id, a decimal string in JSON). On-chain markets the backend doesn't know are still listed on `/markets`, with on-chain data only.

## Wallet and login

`lib/stellar/WalletProvider.tsx` wraps `@creit.tech/stellar-wallets-kit` 2.5.0 (pinned: the last release built on `@stellar/stellar-sdk` 16, the same major as the contract bindings, so the app ships one SDK copy).

- The kit is imported dynamically in an effect, because it reads `localStorage` when its module loads.
- A session the kit persisted is restored without prompting and without redirecting. Only a connect completed in the modal redirects to `/markets`.
- After connecting, the wallet signs the backend's SEP-10 style challenge transaction (`signTransaction`, which every Stellar wallet supports; `signMessage` is not universal). The backend returns a JWT. A stored session for a different address is cleared, never reused.
- `useWallet()` exposes `address`, `isWrongNetwork`, `isPasskey`, a `signer` for the binding clients, `openModal`, `connectPasskey`, `createPasskey`, `ensureSession` and `disconnect`.

## Passkey smart wallets (contract accounts)

Passkey smart wallets (`C…`) are contract accounts whose `__check_auth` verifies secp256r1 ECDSA signatures created via WebAuthn.

- **Feature flag**: Experimental passkey support is gated behind `NEXT_PUBLIC_EXPERIMENTAL_PASSKEYS=true` and badged "Experimental" in the UI.
- **Signer abstraction**: `Signer` (`lib/stellar/clients.ts`) supports both `account` (ed25519 `G…`) and `contract` (`C…`) variants. For contract signers, binding client simulation uses `NEXT_PUBLIC_PASSKEY_RELAYER_SOURCE` as the source account.
- **Auth entry signing & submit**: `submitAsContract` (`lib/stellar/contract-submit.ts`) verifies that simulation requires authorization exclusively from the trader's `C…` contract address, signs the auth entries with WebAuthn, re-simulates for accurate footprint/resources, and forwards the transaction to a fee-paying relayer.
- **RP ID constraints**: WebAuthn requires the Relying Party ID (`rpId`) to match the active origin's domain or a registrable suffix of `window.location.hostname`. Ports and scheme must be omitted.
- **Relayer interface**: A relayer service provides two endpoints:
  - `POST /wallet/deploy`: Deploys the smart wallet contract with the passkey's uncompressed P-256 public key.
  - `POST /tx/submit`: Signs as source/fee payer, submits to the Stellar network, and returns `{ hash }`.
- **Signature normalisation**: Soroban's secp256r1 verification enforces canonical low-S (`s <= N/2`). WebAuthn DER signatures are converted to 64-byte raw `r || s` and normalised (`s' = N - s` if `s > N/2`).

## Contract calls

- `lib/stellar/clients.ts` builds a generated binding `Client` per contract, optionally with the wallet as signer. The USDC Stellar Asset Contract has no Wasm and so no bindings; `token.balance` and `token.transfer` are built with `AssembledTransaction.build`.
- Reads are simulations (no fee, no signature).
- Writes (`useBuy`, `useSell`, `useRedeem`, `useUsdcTransfer`) check that a wallet is connected and on the right network, simulate, then `signAndSend`.
- `useBuy` quotes again immediately before building the transaction and sets `min_shares_out = minOut(quote, slippageBps)`, so slippage is enforced on-chain.
## Write path and transaction lifecycle

Every state-changing write (`useBuy`, `useSell`, `useRedeem`, `useUsdcTransfer`) follows an explicit, observable lifecycle governed by `TxLifecycle` in `lib/stellar/tx-lifecycle.ts`:

1. **Fee Preview & Simulation**: Before signing, `usePrepareBuy` and `usePrepareUsdcTransfer` simulate the transaction. `lib/stellar/fees.ts` calculates `feeBreakdown` (inclusion fee, resource fee, and Soroban resource footprint) and computes `spendableXlm` from the account ledger entry following CAP-33 rules (`minBalance = (2 + numSubEntries + numSponsoring - numSponsored) * baseReserve`). If spendable XLM is below the estimated total fee, the UI disables submission with an exact deficit warning.
2. **Observable Lifecycle Phases**: `useTxRunner` drives the transaction through typed phases:
   - `building` → `simulating` → `awaiting-signature` → `submitting` (hash available) → `pending` (polling with backoff) → `confirmed` | `failed` | `expired`.
   - Expiration is determined from `latestLedgerCloseTime` reported by Stellar RPC, not the browser clock.
   - Statuses and errors (`PENDING`, `DUPLICATE`, `TRY_AGAIN_LATER`, `ERROR`, `txBadSeq`, `op_low_reserve`, etc.) are mapped cleanly to `TxDescribedError`.
3. **Session Transaction Tracker (`lib/stellar/tx-tracker.tsx`)**:
   - `TransactionTrackerProvider` mounted in `WalletProvider` captures every submitted transaction as soon as the hash is known.
   - Transactions are serialized to `sessionStorage` (`oracledesk_pending_txs`) with BigInt amounts as strings, resuming polling on page reload.
   - Polling across multiple browser tabs is coordinated with `BroadcastChannel("oracledesk-tx")` to ensure only one tab polls the RPC server.
   - Upon confirmation, `tradeInvalidationKeys` performs React Query cache invalidations across market, positions, and balance queries even if the initiating component unmounted.
   - The `<TxToastContainer />` component (`components/ui/tx-toast.tsx`) renders accessible toasts announcing state transitions and supports resuming premium daily pass activation follow-ups.

## Reading contract results

Contract calls must always be consumed through `read(tx, contract)` for reads/simulations or `submit(tx, contract)` for signed writes (`lib/stellar/typed-call.ts`).

- **No manual generics or casts**: `read` and `submit` automatically infer and unwrap the return type directly from the contract binding signature (`Result<T>` is unwrapped to `T`, while non-Result values like `Position` or SAC balances remain untouched). Never pass a type parameter (e.g. `read<Type>(...)`) or hand-write contract result shapes. An ESLint rule enforces this across `app/` and `lib/`.
- **Result detection**: Soroban `Result`s are detected using the SDK's `Ok` and `Err` classes (`instanceof`), avoiding duck-typing bugs where plain objects with `isOk` could be mistakenly unwrapped. Unhandled contract errors or simulation failures are mapped to user-friendly messages via `UserFacingError`.
- **Type tests**: `lib/stellar/__tests__/typed-call.test-d.ts` pins the return type of every binding method and argument shape of every write the app calls. When adding or calling a new contract binding method, always add a corresponding type test so upstream contract changes fail during `npm test`.

## Amounts

USDC has 7 decimals. Anything that can reach a transaction is a `bigint` in base units (`lib/stellar/units.ts`). Parsing rejects floats in exponent form and more than 7 decimals. Display floats exist only at the edge of the UI.

## Errors

`lib/stellar/errors.ts` turns SDK, wallet and contract failures into plain sentences. Contract errors are named from the `Error(Contract, #N)` code through each binding's `Errors` table. Wallet rejection, insufficient USDC and a missing USDC trustline are matched first, because token errors raised inside `market_core.buy` carry the token contract's own codes, which overlap with market-core's.

## Generated code

`lib/stellar/generated/` is copied from the pinned `contracts` submodule by `scripts/sync-bindings.mjs`, with a do-not-edit header and `// @ts-nocheck`. CI fails if it's stale. `CATEGORY_TAGS` in `clients.ts` has a compile-time exhaustiveness check against the binding's `Category` type, so a contract enum change breaks the build rather than the UI.

## Rendering

All routes prerender as static pages. Pages that read query parameters (`/markets/quick-view`, `/copy-trade`, `/reasoning/verify`) keep `useSearchParams` inside a `<Suspense>` boundary; without it the production build fails.
