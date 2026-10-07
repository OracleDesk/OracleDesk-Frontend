# End-to-end UI tests with a mocked wallet

## Context

Wallet flows (connect, sign-in, buy, pay) are only covered by a manual checklist (docs/manual-test.md). The signing logic is unit-tested, but nothing renders the pages and clicks through them.

## Scope

- Add Playwright (or similar) with a test-only wallet module for Stellar Wallets Kit that signs with a throwaway `Keypair.random()` held in the test, never a real key.
- Mock the backend with route interception and Stellar RPC with recorded simulate responses, so tests run offline in CI.
- Cover: connect → backend sign-in → balance shown; buy flow up to `signAndSend` (assert the built transaction's contract, function and `min_shares_out`); premium payment builds a USDC `transfer` to `PAYMENTS_RECIPIENT`.

## Out of scope

- Hitting real testnet in CI.
- Visual regression testing.

## Acceptance criteria

- `npm run test:e2e` runs headless in CI without network access or secrets.
- A deliberately broken `min_shares_out` (set to 0) makes a test fail.

## Files likely touched

package.json, new e2e/ui/*, .github/workflows/ci.yml, lib/stellar/WalletProvider.tsx (a test seam, if needed)

## How to test

npm run test:e2e locally and in CI.

## Complexity

`high`

## Labels

enhancement, infra, complexity: high
