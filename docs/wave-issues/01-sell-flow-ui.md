# Sell shares from the market page

## Context

`useSell` in `lib/hooks/useStellar.ts` already turns "sell N shares" into the exact `collateral_out` market-core needs (from fresh reserves, with the contract's own FPMM math) and sets `max_shares_in` a little above N. Nothing in the UI calls it, so a user who buys can't get out before resolution.

## Scope

- On `/markets/quick-view`, when the connected wallet holds YES or NO shares in an open market, show a Sell control next to the position line.
- Input is a share count (decimal string, 7 decimals, parsed with `parseUsdc`-style bigint parsing), with a "Max" button that fills the full position.
- Show the estimated USDC out (from `collateralOutForShares`) before signing.
- Call `useSell` with 1% slippage; show the result and a Stellar Expert link like the buy panel does.

## Out of scope

- Partial sells across both sides at once.
- Changing `useSell`'s maths (if you find a rounding problem, open a separate issue with a failing test).

## Acceptance criteria

- Selling exactly your whole position succeeds on a freshly seeded testnet market (see docs/manual-test.md step 7) and leaves the position at 0.
- Entering more shares than you hold disables the button with a clear message.
- A contract error (e.g. `InsufficientShares`) shows the `describeError` message, not raw XDR.
- `npm run typecheck`, `lint`, `test` and `build` pass.

## Files likely touched

app/markets/quick-view/page.tsx, lib/hooks/useStellar.ts (only if a bug is found)

## How to test

Manual: follow docs/manual-test.md to buy, then sell. Add a screenshot or recording to the PR.

## Complexity

`medium`

## Labels

enhancement, ui, stellar, complexity: medium
