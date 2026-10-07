# Silence recharts zero-size warnings during build

## Context

`npm run build` prints "The width(-1) and height(-1) of chart should be greater than 0" twice while prerendering, from recharts `ResponsiveContainer`s that have no measurable size on the server.

## Scope

- Find the two charts (likely `app/market/page.tsx` and `app/portfolio/analytics/page.tsx`) and give their containers an explicit `minWidth`/`minHeight` or render them client-only, so the warning goes away without changing how they look.

## Out of scope

- Changing chart data or design.

## Acceptance criteria

- `npm run build` output contains no "width(-1)" warning.
- The charts look the same in the browser (before/after screenshots).

## Files likely touched

app/market/page.tsx, app/portfolio/analytics/page.tsx

## How to test

npm run build 2>&1 | grep -c 'width(-1)' returns 0.

## Complexity

`trivial`

## Labels

good-first-issue, ui, complexity: trivial
