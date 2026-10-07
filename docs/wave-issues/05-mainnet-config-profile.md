# Mainnet configuration profile

## Context

Everything defaults to testnet, and `WalletProvider` initialises the wallet kit with `Networks.TESTNET` hardcoded. There is no way to point the app at a different network without code changes, and nothing stops a misconfigured build from mixing a mainnet RPC with testnet contract ids.

## Scope

- Drive the kit's network from `NETWORK_PASSPHRASE` in `lib/stellar/config.ts`.
- Add a `NEXT_PUBLIC_STELLAR_NETWORK` (`testnet` | `mainnet`) that selects passphrase, RPC, explorer and requires explicit contract ids for mainnet (no fallback to the testnet deployments file).
- Fail the build (a check in `config.ts` evaluated at import) if mainnet is selected without all contract ids.

## Out of scope

- Deploying anything to mainnet. The contracts are unaudited.
- A runtime network switcher.

## Acceptance criteria

- Default behaviour (testnet) is unchanged.
- `NEXT_PUBLIC_STELLAR_NETWORK=mainnet` without contract ids fails `npm run build` with a message naming the missing variables.
- Unit tests cover the config resolution.

## Files likely touched

lib/stellar/config.ts, lib/stellar/WalletProvider.tsx, .env.example, README.md

## How to test

npm test; npm run build with and without the variables set.

## Complexity

`medium`

## Labels

enhancement, stellar, complexity: medium
