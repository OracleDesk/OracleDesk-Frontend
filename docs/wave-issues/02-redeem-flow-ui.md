# Redeem winnings after a market resolves

## Context

When market-core resolves a market, holders call `redeem(holder, market_id)` to collect (winning shares pay 1 USDC each; on a void market every share pays 0.5). `useRedeem` exists in `lib/hooks/useStellar.ts`, but there is no button for it.

## Scope

- On `/markets/quick-view`, when `get_market` status is `Resolved` or `Void` and the wallet's position is non-zero, show a Redeem button with the expected payout (`settleValue` from `lib/stellar/generated/fpmm.ts`).
- Call `useRedeem`; on success show the payout and a Stellar Expert link, and refresh position and balance.

## Out of scope

- Redeeming for the treasury or LP (`claim_pool_remainder`).
- A portfolio-wide "redeem all" button.

## Acceptance criteria

- The expected payout shown before signing matches the `payout` returned by the contract.
- After redeeming, the position shows 0 and the button disappears.
- With a zero position the button doesn't render.

## Files likely touched

app/markets/quick-view/page.tsx

## How to test

Unit-test the payout calculation helper you add; manual test on a market a maintainer resolves (or a voided one).

## Complexity

`medium`

## Labels

enhancement, ui, stellar, complexity: medium
