# Shared USDC amount input

## Context

USDC amounts are typed in several places (quick-view buy panel, copy-trade allocation, premium, and soon sell). Each parses on its own. `lib/stellar/units.ts` has `tryParseUsdc`, but there's no shared input that shows a validation message, a Max button and the balance consistently.

## Scope

- Add `components/ui/usdc-input.tsx`: a text input with `inputMode="decimal"`, inline error from `tryParseUsdc` ("USDC has at most 7 decimal places"), optional Max button, optional balance line. It reports a `bigint | null`.
- Use it in the quick-view buy panel.

## Out of scope

- Changing the visual design beyond reusing existing input styles.

## Acceptance criteria

- Typing `1e5`, `-1` or `0.00000001` shows an error and reports `null`.
- The buy panel behaves as before for valid input.
- Component has unit tests for its parsing behaviour (pure helper is fine).

## Files likely touched

components/ui/usdc-input.tsx (new), app/markets/quick-view/page.tsx

## How to test

npm test

## Complexity

`trivial`

## Labels

good-first-issue, ui, complexity: trivial
