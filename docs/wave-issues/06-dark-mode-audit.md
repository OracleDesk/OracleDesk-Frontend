# Dark-mode audit

## Context

The Tailwind setup defines surface/on-surface tokens, but many pages hardcode `bg-white`, `text-white/70` or hex colours (`bg-[#f0f9fa]`, `#005f73`). Nobody has checked the app in a dark colour scheme.

## Scope

- Inventory every hardcoded colour in `app/` and `components/` (a grep is fine) and list them in the PR.
- Replace them with the existing design tokens where an equivalent exists. Don't add new colours or change the light theme's look.

## Out of scope

- Building a theme toggle.
- Redesigning any page.

## Acceptance criteria

- The light theme looks the same before and after (screenshots of `/`, `/markets`, `/premium` in the PR).
- No remaining `bg-white` / hex colour classes in the touched files, or a note in the PR explaining why one stays.

## Files likely touched

app/**/page.tsx, components/**

## How to test

Screenshots before/after; npm run lint and build.

## Complexity

`trivial`

## Labels

good-first-issue, ui, complexity: trivial
