# Replace demo-data panels with indexed data

## Context

Several panels are labelled "Demo data": the stats volume chart, top copied trades and network trace, the home page protocol activity and top positions, and the wallet page chart and transaction history. The backend now indexes contract events into `chain_events`.

## Scope

- Pick one panel per PR. Replace its sample data with real data from a backend endpoint (add the endpoint in the backend repo first if needed), and remove its demo badge.
- Start with the wallet page transaction history: the user's own market-core `Trade` and `Redeemed` events.

## Out of scope

- New charts or panels.
- Panels that need data the contracts don't emit.

## Acceptance criteria

- The panel shows real data or a clear empty state; the "Demo data" badge is gone for that panel only.
- Amounts are formatted from base-unit strings, never floats.

## Files likely touched

app/portfolio/wallets/page.tsx, app/stats/page.tsx, app/page.tsx, lib/api/*

## How to test

Screenshot with real data from a local backend.

## Complexity

`medium`

## Labels

enhancement, ui, complexity: medium
