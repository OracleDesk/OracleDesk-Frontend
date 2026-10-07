# Optional SEP-53 signMessage login

## Context

Login signs a SEP-10 style challenge transaction because every Stellar wallet supports `signTransaction`. Some wallets (Freighter, xBull, Lobstr…) also support `signMessage` (SEP-53), which shows the user a readable message instead of a transaction. Ledger, Trezor, Albedo and others don't, per the wallet kit 2.5.0 modules.

## Scope

- Depends on the backend issue for a SEP-53 verify path.
- When the selected wallet supports `signMessage`, use it for login; otherwise fall back to the challenge transaction. Detect support from the kit, not a hardcoded wallet list.

## Out of scope

- Removing the transaction-based login.

## Acceptance criteria

- Freighter logs in via signMessage; a hardware wallet still logs in via the transaction path.
- A failed signMessage falls back cleanly with a readable error.

## Files likely touched

lib/stellar/WalletProvider.tsx, lib/api/auth.ts

## How to test

Unit-test the fallback decision; manual test with two wallets.

## Complexity

`medium`

## Labels

enhancement, stellar, complexity: medium
