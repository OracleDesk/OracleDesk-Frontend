# Accessible names and focus states for icon buttons

## Context

Many buttons are a Material Symbols glyph only (`<button className="material-symbols-outlined">close</button>`). Screen readers announce the ligature text ("close", "filter_list", "chevron_left") or nothing useful, and several have no visible focus style. A few were fixed during the Stellar port (wallet menu, copy-trade close, premium close); most weren't.

## Scope

- Give every icon-only button or link an `aria-label` in plain words, and hide the glyph from assistive tech (`aria-hidden="true"` on the icon span).
- Make sure each has a visible `focus-visible` ring using existing tokens.

## Out of scope

- Full WCAG audit or colour-contrast changes.
- Changing button visuals beyond the focus ring.

## Acceptance criteria

- `grep -rn "material-symbols-outlined" app components` shows no icon-only `<button>` without an `aria-label`.
- Keyboard-only: you can tab to and see focus on every icon button on `/markets`, `/notifications`, `/portfolio/wallets`.

## Files likely touched

app/**/page.tsx, components/layout/*

## How to test

Keyboard walk-through; optionally run axe DevTools and attach the before/after counts.

## Complexity

`trivial`

## Labels

good-first-issue, a11y, ui, complexity: trivial
