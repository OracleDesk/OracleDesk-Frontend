# Fix the fpmm.ts path in the contracts repo's frontend guide

## Context

`docs/frontend-integration.md` in OracleDesk-SmartContract (line 73) says the sell-side math is at `agents/core/src/fpmm.ts`. It's at `agents/core/fpmm.ts`. Recorded in this repo's docs/contract-requests.md #1.

## Scope

- Open a PR against **OracleDesk-SmartContract** fixing the path, and link it here.
- Once merged, bump this repo's `contracts` submodule and run `npm run sync:bindings` (expect no changes to generated code).

## Out of scope

- Any other doc changes in the contracts repo.

## Acceptance criteria

- The contracts repo PR is merged.
- This repo's submodule points at a commit containing the fix and `npm run check:bindings` passes.

## Files likely touched

contracts (submodule pointer), docs/contract-requests.md

## How to test

npm run check:bindings

## Complexity

`trivial`

## Labels

good-first-issue, documentation, complexity: trivial
