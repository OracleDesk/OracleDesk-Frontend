# Security Policy

## Status: testnet only, unaudited

This frontend talks to OracleDesk contracts deployed on Stellar **testnet
only**. Nothing has been professionally audited. Don't use it with mainnet
funds or keys. See [docs/STATUS.md](docs/STATUS.md) for what is and isn't
verified.

## Reporting a vulnerability

Report privately, not in a public issue:

- [GitHub Security Advisories](../../security/advisories/new) for this
  repository, or
- email **SECURITY-CONTACT-TBD@example.invalid**
  <!-- TODO(maintainer): replace with the real private disclosure address. -->

<!-- TODO(maintainer): state a triage/response timeline once you have one. -->

In scope, for example:

- Anything that makes the app sign a transaction the user didn't intend
  (wrong contract, wrong amount, wrong recipient, missing slippage bound).
- Rendering reasoning-trace content that hasn't passed the hash check in
  `lib/stellar/trace.ts`.
- Leaking a secret through a `NEXT_PUBLIC_*` variable (these are compiled
  into browser JavaScript).
- Reusing a backend session for a different wallet.

Out of scope: the contracts (report to
[OracleDesk-SmartContract](https://github.com/OracleDesk/OracleDesk-SmartContract)),
the backend (report to
[OracleDesk-Backend](https://github.com/OracleDesk/OracleDesk-Backend)), and
third-party dependencies unless this repo's use of them is what's
exploitable.
