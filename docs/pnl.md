# On-Chain Cost-Basis & PnL Accounting (`lib/portfolio/pnl.ts`)

OracleDesk computes user position cost basis, realized PnL, unrealized PnL, and redemption PnL by replaying on-chain `market-core` events (`Trade`, `MarketResolved`, `Redeemed`, plus optional creator `seed` events) in 7-decimal USDC base units (`bigint`, where `1 USDC = 10_000_000` stroop-scale units).

No floating-point conversion occurs anywhere in the accounting pipeline.

---

## 1. Event Ordering & Idempotence

Before replay, events are sorted canonically by `(ledger, id)` ascending and deduplicated by `id`. Passing duplicate event IDs or out-of-order events within the same ledger produces the exact same state.

---

## 2. Average-Cost Accounting Rules

Each market maintains two independent outcome legs (`yes` and `no`), each tracking `{ shares, cost, realized, fees, bought, sold }`.

### Buys (`isBuy: true`)

In `market-core`, a `buy` transfers `collateral_in` from the trader, deducts `fee = ceil(collateral_in * fee_bps / 10_000)` into the pool's accrued fees, and mints/swaps `shares_out` to the trader. The `Trade` event records `collateral = collateral_in`, `shares = shares_out`, and `fee`.

Because the trader paid the full `collateral_in` to acquire the shares:

```
leg.shares += shares
leg.cost   += collateral
leg.fees   += fee
leg.bought += shares
```

### Sells (`isBuy: false`)

In `market-core`, a `sell` burns/swaps `shares_in` from the trader and transfers `collateral_out` (after fees) to the trader. The `Trade` event records `collateral = collateral_out`, `shares = shares_in`, and `fee = gross - collateral_out`.

When selling `s` shares for `c` collateral out:

```
removed = (s === leg.shares)
  ? leg.cost
  : mulDivFloor(leg.cost, s, leg.shares)

leg.cost     -= removed
leg.shares   -= s
leg.realized += c - removed
leg.fees     += fee
leg.sold     += s
```

#### Why `mulDivFloor` + Full-Exit Reset Eliminates Rounding Drift

Flooring `leg.cost * s / leg.shares` leaves any sub-unit rounding remainder inside `leg.cost`. When the final shares of the leg are sold (`s === leg.shares`), `removed` is set to the entire remaining `leg.cost`, resetting `leg.cost` to `0n`.

Consequently, for any position acquired for total cost $C$ and exited across $k$ partial sells yielding $c_1, c_2, \dots, c_k$:

$$\sum_{i=1}^{k} \text{removed}_i = C \quad\Longrightarrow\quad \sum_{i=1}^{k} \text{realized}_i = \sum_{i=1}^{k} c_i - C$$

The total realized PnL across arbitrary partial exits reconciles to the single-exit result to the single base unit (stroop).

### Oversells (Retention / Incomplete History)

If a wallet bought shares before the Stellar RPC's event retention window, the replay may encounter a sell of `s` shares when `leg.shares < s`. Rather than throwing or producing a negative cost basis:

1. `s` is clamped to `leg.shares`.
2. All known `leg.cost` is removed (`leg.cost = 0n`, `leg.shares = 0n`).
3. An anomaly is recorded in `market.anomalies`.

---

## 3. Resolution & Redemption

### Resolved Without Redeem

When `MarketResolved` is replayed (`Yes`, `No`, or `Void`), `market.resolution` updates while `market.redeemed` remains `false`. Calling `unrealizedAt(market, yesBps)` values the held shares at their exact settlement payout (`settleValue(kind, yes.shares, no.shares)`) rather than a mid price.

### Redeem (`Redeemed`)

`market_core.redeem` settles both `YES` and `NO` holdings in a single call and zeroes the on-chain position:

- **Winning outcome (`Yes` or `No`)**: pays `1` base unit per winning share and `0` for the losing side.
- **Void market (`Void`)**: pays `settleValue("void", yes.shares, no.shares) = (yes.shares + no.shares) / 2n` (floored once on the sum). To allocate a void payout across the two legs without losing or inventing a base unit when `yes.shares + no.shares` is odd:
  ```
  yesPart = mulDivFloor(payout, yes.shares, yes.shares + no.shares)
  noPart  = payout - yesPart
  ```
- **Redemption PnL**:
  ```
  redemptionPnl += payout - (yes.cost + no.cost)
  yes.shares = 0n; yes.cost = 0n
  no.shares  = 0n; no.cost  = 0n
  redeemed   = true
  ```
- **Payout mismatch**: if the event's `payout` differs from `settleValue(kind, yes.shares, no.shares)` (indicating missing trade events), the on-chain `payout` is trusted and an anomaly is appended to `market.anomalies`.

---

## 4. Mark-to-Mid (`unrealizedAt`)

For an open market at spot price `yesBps` (in `[0, 10_000]`):

```
value      = mulDivFloor(yes.shares, yesBps, 10_000n) + mulDivFloor(no.shares, 10_000n - yesBps, 10_000n)
unrealized = value - (yes.cost + no.cost)
```

> **Note:** Mid value (`shares * spotPrice`) overstates what a seller can actually exit for on an FPMM because selling moves the constant-product reserves against the seller and incurs `fee_bps`. See `lib/portfolio/valuation.ts` for executable liquidation value.

---

## 5. Creator Seed Shares Policy

When `create_market` seeds a market with `seed_amount` at `initial_yes_bps`, the FPMM keeps `reserveYes` and `reserveNo` in the pool and credits any leftover shares (`creatorYes` or `creatorNo` from `seedReserves(seed, initialYesBps)`) to the creator as a position without emitting a `Trade` event.

By policy (not an on-chain invariant), `seedCostBasis(seed, initialYesBps)` values those leftover shares at the opening price:

```
costBasis = mulDivFloor(creatorYes, initialYesBps, 10_000n)
          + mulDivFloor(creatorNo, 10_000n - initialYesBps, 10_000n)
```

and treats the rest of `seed_amount` as LP capital outside trader position accounting.

---

## 6. Worked Example

Suppose a trader trades on Market `#1` (7-decimal base units):

1. **Buy 1**: Pays `100_000_000n` (10.0000000 USDC, including `1_000_000n` fee) for `150_000_000n` YES shares.
   - `yes.shares = 150_000_000n`, `yes.cost = 100_000_000n`, `yes.fees = 1_000_000n`.
2. **Sell 1 (partial, 1/3)**: Sells `50_000_000n` YES shares for `40_000_000n` USDC out (`fee = 404_041n`).
   - `removed = mulDivFloor(100_000_000n, 50_000_000n, 150_000_000n) = 33_333_333n`.
   - `yes.cost = 100_000_000n - 33_333_333n = 66_666_667n` (keeps the `1n` rounding residue).
   - `yes.shares = 100_000_000n`.
   - `yes.realized = 40_000_000n - 33_333_333n = +6_666_667n`.
3. **Sell 2 (remaining 2/3)**: Sells `100_000_000n` YES shares for `75_000_000n` USDC out (`fee = 757_576n`).
   - Because `s === yes.shares`, `removed = yes.cost = 66_666_667n`.
   - `yes.cost = 0n`, `yes.shares = 0n`.
   - `yes.realized = 6_666_667n + (75_000_000n - 66_666_667n) = +15_000_000n`.
   - Total cash out (`40_000_000n + 75_000_000n = 115_000_000n`) minus total cash in (`100_000_000n`) equals `+15_000_000n` to the stroop.
