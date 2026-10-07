# Per-trace unlock through the x402 service

## Context

Per-trace unlocks are meant to go through the contracts repo's x402 service (`GET {NEXT_PUBLIC_X402_URL}/traces/:onChainTraceId`, see docs/api.md). The service returns HTTP 402 with payment requirements, and the client pays with the x402 exact Stellar scheme. The frontend doesn't implement the client side yet.

## Scope

- Add an x402 client using the `@x402/*` packages the service uses, with the connected wallet as signer.
- On a trace page, if `NEXT_PUBLIC_X402_URL` is set, offer "Unlock this trace", run the 402 → pay → retry flow, and render the returned content only after `verifyTraceHash` passes against the on-chain hash.
- Hide the button when `NEXT_PUBLIC_X402_URL` is empty.

## Out of scope

- Running or deploying the x402 service or a facilitator.
- The daily pass (already handled by the backend).

## Acceptance criteria

- Against a local x402 service with a test facilitator, a trace unlocks and renders; with a tampered gateway response it shows the mismatch state and no content.
- No private key is ever handled by the app; signing goes through the wallet.

## Files likely touched

lib/stellar/x402.ts (new), app/premium/trace/page.tsx or app/reasoning/detail/page.tsx, package.json, .env.example

## How to test

Unit-test the 402 parsing with recorded responses; manual run documented in the PR.

## Complexity

`high`

## Labels

enhancement, stellar, complexity: high
