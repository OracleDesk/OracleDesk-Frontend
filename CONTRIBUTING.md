# Contributing to the OracleDesk frontend

Thanks for helping. This is a testnet-only, unaudited project; see
[docs/STATUS.md](docs/STATUS.md) for what works today.

## Setup

```bash
git clone --recurse-submodules https://github.com/OracleDesk/OracleDesk-Frontend.git
cd OracleDesk-Frontend
nvm use            # Node 22 (see .nvmrc)
npm ci
cp .env.example .env.local
npm run dev
```

Forgot `--recurse-submodules`? Run `git submodule update --init`.

Production builds require `NEXT_PUBLIC_API_URL` (no remote fallback); it must
end with `/api/v1`. Local `.env.local` values are validated at startup, and an
invalid value fails the build with the full list of problems. See
[docs/security.md](docs/security.md) for the Content-Security-Policy rollout.

## Branches and commits

- Branch names: `feat/…`, `fix/…`, `docs/…`, `chore/…`, `test/…`.
- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
  `fix:`, `docs:`, `test:`, `chore:`, `refactor:`. One logical change per
  commit.
- No force-pushes to shared branches.

### Required checks

Maintainers should protect `develop` with the `Typecheck, lint, test, build` (`frontend`) status check as a required check so broken merges cannot land on `develop`.

## Checks (CI runs exactly these)

<!-- ci-claims: ignore: node scripts/run-allowed-install-scripts.mjs, node scripts/scan-build-secrets.mjs, npm run perf:lhci -->

```bash
npm run check:ci-claims  # CONTRIBUTING.md and docs/architecture.md match .github/workflows/ci.yml
npm run check:bindings   # generated contract code matches the submodule
npm run check:env        # .env.example documents every NEXT_PUBLIC_* the code reads
npm run check:api-errors # API error codes match docs/api.md
npm run check:sdk        # root SDK, wallet kit range and bindings agree on one major
node scripts/spec-diff.mjs --base origin/develop # report contract interface changes
npm run typecheck
npm run lint
npm run check:docs
npm run i18n:check       # message catalogs: ICU syntax, key parity, unused keys, typed params
npm test
npm run test:scripts
npm run build
npm run check:origins    # no unknown third-party origins in the build
npm run scan:secrets     # no secrets or unlisted NEXT_PUBLIC_* names in the build
node scripts/check-demo-links.mjs # no production links to retired demo routes
npm run check:x402       # frontend and x402 service pin the same @x402/* versions
npx tsc -p e2e/x402      # typecheck the x402 contract test harness
npm run e2e:x402         # offline x402 contract tests
```

## Dependencies

- Add dependencies with an exact version (`.npmrc` sets `save-exact=true`)
  and justify the package and its install scripts in the PR.
- Lifecycle scripts are disabled (`ignore-scripts=true` in `.npmrc`). A
  package that genuinely needs one must be added to `allowedInstallScripts`
  in `package.json` with a one-line reason; CI runs only those with
  `npm run install:allowed-scripts`.
- `@creit.tech/stellar-wallets-kit` stays pinned to 2.5.0 and
  `@stellar/stellar-sdk` stays on the same major as the generated bindings.
  `npm run check:sdk` fails when they drift; do not bump across majors
  without regenerating the bindings.
- Dependency review runs on PRs and fails on new high/critical advisories.
  `ALLOWED_GHSAS` is the reviewed repository-variable escape hatch; Dependabot
  ignores are the update escape hatch (see `.github/dependabot.yml`).
- Reviewed registry-install exception: `sharp` (Next.js image optimization).
  Nothing else may run an install script without a matching PR reason.

`npm run e2e:testnet` is an optional, read-only check against a running
backend and live testnet; see the header of `e2e/testnet.e2e.test.ts`.

## Measuring realtime feeds

Use separate terminals:

```bash
node scripts/realtime-burst.mjs --manual --port 4310
NEXT_PUBLIC_API_URL=http://localhost:4310/api/v1 npm run dev
```

Open `/markets?profile=1` or `/?profile=1` and keep that tab visible.
Development-only React Profiler logs `[realtime-profile]`, the component
name, commit count and total `actualDuration` every second. Let the page
settle, then trigger each sample from another terminal:

```bash
curl 'http://localhost:4310/burst?count=500&rate=500'
# Wait for completion before starting the next sample.
curl 'http://localhost:4310/burst?count=500&rate=50'
```

Sum logged intervals covering each burst and its final settling interval.
Use the same browser, viewport and animation preference for both revisions.
For a baseline, instrument the original feed with the same profiler wrapper;
the original feeds need no functional changes. Profiler time measures React
render work, not socket validation, paint, or end-to-end latency. Slow
baselines may coalesce events under load, so fewer commits alone do not
prove better responsiveness. Production ignores `?profile=1`.

The simulator serves an empty market API and emits synthetic public trades;
it never signs or submits transactions. `--count`, `--rate` and `--port` also
configure its automatic burst (omit `--manual` to emit after the first
connection). See [docs/STATUS.md](docs/STATUS.md) for measured results.

## When the contracts change

The contracts live in
[OracleDesk-SmartContract](https://github.com/OracleDesk/OracleDesk-SmartContract)
and are the source of truth. This repo pins them as the `contracts`
submodule and copies the generated code into `lib/stellar/generated/`.

```bash
git -C contracts fetch origin
git -C contracts checkout <new commit>
npm run sync:bindings
npm run typecheck && npm test   # the Category exhaustiveness check fails here if the enum changed
git add contracts lib/stellar/generated
```

Never edit `lib/stellar/generated/` by hand. If you think a contract needs
to change, write it up in [docs/contract-requests.md](docs/contract-requests.md)
and open the issue in the contracts repo.

### x402 contract tests

`e2e/x402/` runs the frontend's x402 client (`lib/x402/client.ts`) against the
real trace service from the submodule (`x402/trace-api.ts`), fully offline: a
stub facilitator (`e2e/x402/stub-facilitator.ts`) checks the signed payment,
a fake gateway serves the fixtures in `e2e/x402/fixtures/traces/`, the Soroban
RPC is answered in-process, and any connection to a non-loopback host fails.
CI runs it as the `x402-contract` job inside an `unshare --net` namespace with
no external network egress.

```bash
npm ci --ignore-scripts --prefix contracts/oracledesk-stellar/x402   # the service's own dependencies
npm run check:x402         # frontend and service resolve the same @x402/* versions
npx tsc -p e2e/x402        # typecheck the harness (kept out of the app's tsconfig)
npm run e2e:x402           # run the offline x402 contract suite
```

When the submodule moves:

1. Run `npm ci --ignore-scripts --prefix contracts/oracledesk-stellar/x402`, then `node scripts/check-x402-versions.mjs`. If the service now resolves
   different `@x402/*` versions, pin the frontend to exactly those
   (`npm install --save-exact @x402/core@<v> @x402/stellar@<v>`) and read
   the release notes for header, payload or settlement-flow changes.
2. Run the `e2e/x402` harness (see above). "contracts/x402 API changed: update
   e2e/x402/harness.ts and the frontend client" means `createTraceApi` or
   `MapTraceRepository` moved or changed shape: adapt `e2e/x402/harness.ts`,
   then `lib/x402/client.ts` if the wire format changed.
3. If the service's trace format changes, regenerate the fixture with the
   submodule's `agents/core/trace.ts` `buildTrace` (canonical JSON) and update
   `FIXTURE_TRACE_HASH` in `e2e/x402/harness.ts` to its sha256.

## Changing analytics events

Analytics events are typed, versioned and inventoried — an event change is a
contract with the dashboards and with `docs/privacy.md`:

1. Edit `AnalyticsEvents` **and** `EVENT_SPECS` in
   `lib/observability/analytics-events.ts` together (the `satisfies` binding
   makes a one-sided edit a type error).
2. Bump `ANALYTICS_SCHEMA_VERSION` in the same commit.
3. Update the expected schema in
   `lib/observability/__tests__/analytics-schema.test.ts` (the snapshot test
   fails until the version bump is reflected there).
4. Add the event/property to the inventory table in
   [docs/privacy.md](docs/privacy.md) and append a changelog entry.

Never add a wallet address, transaction hash, exact amount, market/trace id
or any free-text user input to an event — amounts go through `bucketUsdc`,
durations through `bucketDuration`. The runtime guard drops the whole event
if an identifier-shaped string slips through, but it is a safety net, not a
licence.

## Working on a Drips Wave issue

This repo takes part in [Drips Wave](https://docs.drips.network/wave/).
Per the current Drips docs:

1. Find the issue on the Drips Wave **Explore** page (or in this repo's
   issues once a maintainer has added it to a Wave).
2. **Apply** for it on Drips. Don't start coding until a maintainer assigns
   you; the issue isn't yours before that.
3. Open a PR that links the issue (`Closes #123`).
4. Points are earned when the PR is merged and the issue is marked resolved
   **before the Wave ends**. Complexity (Trivial 100 / Medium 150 /
   High 200 points) is set by the maintainer; if an issue turns out harder
   than labelled, say so on the issue before it's resolved.

Drips also limits how many issues one person can be assigned per
organization in a Wave; check the Drips docs for the current numbers.
Issue drafts live in [docs/wave-issues/](docs/wave-issues/) before they're
filed.

## What a good PR includes

- A short description and the issue it closes.
- All checks above passing locally.
- Screenshots or a short recording for any UI change.
- Tests for new logic (`lib/**` especially), and updated docs
  (`docs/api.md` is owned by the backend; change it there first).
- UI copy in plain sentence case, from the user's point of view. Don't
  claim anything the app doesn't do; label sample data as demo data.
- Amounts as `bigint` in 7-decimal USDC base units
  (`lib/stellar/units.ts`), never floats, for anything that reaches a
  transaction.
- Any code that persists to `localStorage`, IndexedDB, or polls across tabs
  must follow the cross-tab coordination rules in
  [docs/testing.md](docs/testing.md#multi-tab-coordination-harness-libtestingmulti-tab)
  and add a multi-tab race scenario using `lib/testing/multi-tab/`.

## Number and money formatting

All money, basis-point, and probability display strings in `app/` must go
through [`lib/format/money.ts`](lib/format/money.ts):

- **USDC amounts (`formatUsdcDisplay`)**: 2 decimal places by default,
  truncating toward zero (never rounding up money the user does not have),
  always grouped (`en-US` commas), with a ` USDC` suffix and no `$` symbol.
  Non-zero dust below `0.01 USDC` renders as `< 0.01 USDC`. Compact notation
  (`{ compact: true }`) uses integer `bigint` division (`1.23M USDC`, `14.1K USDC`).
- **Signed USDC PnL (`formatSignedUsdc`)**: explicit `+` or `−` (U+2212) sign
  for non-zero displayed amounts, and `0.00 USDC` without a sign when zero or
  truncated to zero.
- **Basis points (`formatBps`) and probabilities (`formatProbability`)**:
  probabilities render with 1 decimal place and a `%` suffix; signed basis-point
  changes render with 2 decimal places by default.
- **Backend float records (`floatUsdcToRaw`)**: always prefer `*Raw` decimal
  string fields when the API provides them (`availableCapitalRaw`,
  `seedAmountRaw`, `collateralRaw`, `amountRaw`). Remaining backend float-only
  fields are converted once at the boundary via `floatUsdcToRaw` and labelled as
  `backend record` in the UI.
- **Lint enforcement**: `eslint.config.mjs` bans `.toFixed` and
  `.toLocaleString` on money-named identifiers and `$`-prefixed template
  literals in `app/**/*.tsx`. If a non-money value matches the naming
  heuristic, rename the identifier or add
  `// eslint-disable-next-line no-restricted-syntax -- not money: <reason>`.

## Formatting money and time

Everything that formats or parses an amount, a percentage or a ledger time lives in `lib/format/locale.ts`:

- **Never `Number(raw)` for display math.** Amounts are `bigint` base units until the moment they are shown. Use `formatUsdcLocale` / `formatAmount`; they format the whole part with `Intl.NumberFormat#format(bigint)` and truncate the fraction as a digit string. `lib/format/__tests__/locale.test.ts` greps the module for `parseFloat`, `toFixed` and `Number(raw)`.
- **Truncate money, round percentages.** Amounts never round up. `formatBpsPercent` rounds half away from zero in bigint (53.19% shows as 53.2%).
- **Components use `useFormat()`** (`lib/format/useFormat.ts`). It returns `usdc`, `amount`, `percent`, `points`, `ledgerTime`, `parseAmount` and `tryParseAmount` bound to the active locale. It renders `en` during prerender and hydration, then switches on mount, so there are no hydration mismatches.
- **Parsing inputs:** use `fmt.parseAmount` / `fmt.tryParseAmount` (wrapping `parseLocaleAmount`), not `tryParseUsdc`, for text a person types. It accepts the locale's decimal separator and digits, strips bidi marks, and rejects exponents, signs and ambiguous separators (a lone `.` in `de-DE`). `parseUsdc` stays the ASCII rule both build on (`parseDecimalAscii`).
- **Dates:** `formatLedgerTime(seconds, locale, { timeZone, style })`; pass `timeZone: "UTC"` in verification views. Do not hardcode `en-US` / `en-GB` in migrated code.
- `bpsToPercent` is deprecated; new code uses `formatBpsPercent`.
- Tests compare exact code points: `Intl` emits U+00A0, U+202F and U+061C.

## Dialogs

Modal flows (market quick-view, copy-trade, premium checkout, and trace verification) must use the accessible primitive in `components/ui/dialog.tsx`:
- Always wrap modal content in `Dialog`, `DialogContent`, and provide an accessible name via `DialogTitle` (use `className="sr-only"` if visually redundant) and `DialogDescription`.
- Choose the appropriate initial focus using `initialFocusRef` (e.g. amount input or primary action control).
- Announce transaction lifecycle states and settled quotes politely via `components/ui/live-region.tsx` (`<LiveRegion message="..." />`) without announcing in-progress or raw URLs.
- Mark simulated or blurred background elements as `aria-hidden="true"` and `inert` to keep them out of the accessibility tree and tab order.
- Block dismissals (Escape or outside click) during active transaction submissions to prevent accidental orphan states, and announce the reason why.

## Navigation and routes

The site header navigation routes are declared in a single source of truth: `components/layout/nav-items.ts` (`NAV_ITEMS`).
- Any new primary route or nested route section must be added to `NAV_ITEMS`.
- Active styling is computed using `isActive(item, pathname)`.
- The single exact link carrying `aria-current="page"` is resolved using `activeHref(pathname)`. Exact child matches take precedence over section parent links.
- Desktop dropdown navigation is powered by Radix `NavigationMenu` (disclosure navigation with keyboard arrow navigation and Escape support).
- Mobile navigation is rendered by `MobileNav.tsx` using Radix `Dialog` as an accessible sheet that traps focus and auto-closes on route changes.

## Bumping the contracts submodule

When the contracts repository changes:

1. Update the pinned submodule:
   ```bash
   git -C contracts checkout <commit-or-tag>
   npm run sync:bindings
   ```
2. Run the interface change report:
   ```bash
   node scripts/spec-diff.mjs
   ```
   This decodes embedded contract specifications from both the base branch and the new bindings, producing a structured diff of functions, types, error codes, and events.

### Clearing CI spec-diff failures

- **Uncovered Contract Errors**: If a new contract error code was added without a user-facing message, add an entry to `lib/i18n/messages/en.json` under `errors.contract.<contractName>.<ErrorName>`. Run `npm test` to verify catalog coverage.
- **Breaking Call-Site References**: If a contract function was removed or its signature changed, update the calling code in `lib/`, `app/`, `components/`, or `e2e/` so no dead or mismatched invocations remain.
- **Renumbered Error Codes**: Renumbering existing error codes breaks client-side error mapping and is rejected. Coordinate with contract maintainers to deprecate rather than renumber codes.
- **Event Changes**: Changes to `Trade` or `TracePublished` events flag a requirement for backend indexer review.

## Error Code Taxonomy & Adding Error Codes

All errors in OracleDesk use a stable, typed taxonomy with localized messages in `lib/i18n/messages/en.json`:
- **Contract errors**: Defined by generated bindings (`market-core`, `treasury`, `resolver`, `reasoning-registry`). To add a message for a new contract error, add `errors.contract.<contractName>.<ErrorName>` to `lib/i18n/messages/en.json`.
- **Backend API errors**: Documented in `docs/api.md`. To add a new backend error code:
  1. Document it in `docs/api.md` with its HTTP status (e.g., `400 INVALID_FOO`).
  2. Add it to `API_ERROR_CODES` in `lib/errors/codes.ts`.
  3. Add a plain-language, user-facing message to `errors.api.<CODE>` in `lib/i18n/messages/en.json`.
  4. Run `npm run check:api-errors` and `npm test` to ensure CI checks pass.
- **Client/Wallet errors**: Defined in `DESCRIBED_ERROR_KINDS` in `lib/errors/codes.ts` with catalog entries under `errors.kind.*`.
- **Displaying in UI**: Always render errors via `userMessage(err)` from `lib/errors/display.ts` instead of raw `err.message`.

## Right-to-left (RTL) layout

- **Logical Tailwind utilities**: Always use logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `rounded-s-*`, `rounded-e-*`, `border-s`, `border-e`) in `app/` and `components/`. ESLint rejects physical `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right` utilities unless annotated with `// rtl-physical-ok`.
- **Symmetric centering**: `left-1/2 -translate-x-1/2` is symmetric and may remain physical.
- **Bidi isolation (`<Ltr>`)**: Wrap Stellar G-addresses, C-contract IDs, transaction hashes, IPFS CIDs, on-chain IDs (`#12`), and amount+unit pairs (`1,234.50 USDC`) in `<Ltr>` (`components/ui/ltr.tsx`) so the bidi algorithm cannot reorder characters in RTL locales.
- **Icon mirroring**: Pass `mirror` to `<Icon>` for navigation-direction icons (`chevron_right`, `arrow_forward`, `arrow_back`). Do **not** mirror value/flow-semantics icons (`trending_up`, `trending_down`, `north_east`, `south_west`).

## Using Term & Plain-Language Glossary (#305)

To comply with WCAG 2.2 AAA accessibility requirements (3.1.3 Unusual Words and 3.1.4 Abbreviations):

- **Wrap Bare Protocol Vocabulary**: Do not leave bare domain or Stellar jargon unexplained in user-facing JSX text. Use `<Term id="...">{children}</Term>` (`components/ui/term.tsx`).
- **Available Terms**: Defined in `lib/glossary/terms.ts` (e.g. `slippage`, `limit-price`, `trustline`, `base-reserve`, `xlm`, `usdc`, `sac`, `void`, `trace-hash`, `reasoning-agent`).
- **Interactive Nesting Protection**: Never nest a `<Term>` trigger button inside another `<button>`. If a term appears within button text, wrap the button children with `<InInteractiveContext.Provider value={true}>` to trigger the accessible non-interactive `<span>` fallback.
- **Adding New Terms**:
  1. Add the term ID to `TermId` in `lib/glossary/terms.ts`.
  2. Provide `short` definition strictly `<= 140` characters (tested in CI).
  3. Provide `long` markdown description and valid `source` repo path.
  4. Run `npm test` to verify `lib/glossary/__tests__/terms.test.ts`.
- **ESLint Enforcement**: `eslint-rules/no-bare-jargon.mjs` checks user-facing JSX text for bare keywords. In non-user-facing test fixtures or code, annotate exceptions with `// bare-jargon-ok`.



