# Resolver status panel on the market page

## Context

Each market committed to a resolution rule when it was created (ADR 0001 in the contracts repo). The backend exposes `GET /oracle/markets/:marketId/resolution` (resolver state, market-core status, the committed `resolutionHash` and the revealed spec), but the UI never shows how or whether a market will resolve.

## Scope

- Add a collapsible "Resolution" section to `/markets/quick-view` for markets with a backend record.
- Show: resolver state (Unconfigured / SignersPending / Finalized), market-core status, the commitment hash, and the revealed spec in plain words ("1 of 1 signers: GCM7…XAIF, 24h dispute window").
- Label each value's source (chain vs backend) with the existing `SourceTag`.

## Out of scope

- Attesting or finalizing from the UI.
- Price-mode (Reflector) specs beyond displaying their fields.

## Acceptance criteria

- Market 1 on testnet (backend record seeded as in docs/STATUS.md) shows Finalized / Resolved YES.
- A market without a revealed spec says so plainly instead of showing an empty box.
- No new `any` types; lint passes.

## Files likely touched

app/markets/quick-view/page.tsx, lib/api/markets.ts (getResolution already exists)

## How to test

Manual against a local backend; add a small unit test for the spec-to-sentence formatter.

## Complexity

`medium`

## Labels

enhancement, ui, complexity: medium
