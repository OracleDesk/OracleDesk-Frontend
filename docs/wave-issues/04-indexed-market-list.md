# Use an indexed endpoint instead of N RPC reads for market lists

## Context

`useOnChainMarkets` reads `market_count` and then calls `get_market` once per market, and every market card does its own `get_market`. That's fine for two markets and slow for two hundred. The backend's indexer already stores contract events in `chain_events`.

## Scope

- Depends on the backend issue "Indexed on-chain market list endpoint". Once that exists, switch the markets page to it for the list, keeping a single live `get_market` read on the detail page.
- Keep the chain/backend source labels honest: data from the indexer is labelled as indexed, with its ledger.

## Out of scope

- Building the backend endpoint (separate issue).
- Removing `useOnChainMarket` from the detail page.

## Acceptance criteria

- `/markets` with 20 on-chain markets makes one request for the list instead of 21+.
- The page still renders on-chain-only markets.
- Typecheck, lint, tests, build pass.

## Files likely touched

app/markets/page.tsx, lib/hooks/useStellar.ts, lib/api/markets.ts

## How to test

Compare network requests in DevTools before/after; include the counts in the PR.

## Complexity

`high`

## Labels

enhancement, stellar, complexity: high
