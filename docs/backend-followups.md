# Backend follow-ups

These frontend flows are implemented against the contracts below. If the backend
does not expose them yet, the UI degrades to a clear unavailable/empty state and
does not invent data.

## Scoped step-up (issue #277)

- `403 STEP_UP_REQUIRED` may include `details: { maxAgeSeconds: number }`.
- Any 403 with `details.reauthenticate === true` is treated as a step-up prompt.
- The challenge must bind the connected wallet, backend session id and current
  Stellar network passphrase. A signature made for another wallet/network must
  not extend the current session's freshness window.
- Replayed requests are allowed only for `GET`/`HEAD` and idempotent `PUT`/
  `PATCH` endpoints. The frontend sends `Idempotency-Key` on those requests.
  `POST` and `DELETE` are never replayed automatically after a prompt.
- `GET /admin/admins` returns `BackendAdminAssignment[]` shaped as
  `{ walletAddress, roleName, scope?, createdAt? }` and is safe to call with
  step-up. The frontend uses `userKeys.adminAdmins(scope)` and never caches it
  under a global key.

## Trace audit (issue #278)

- `GET /admin/trace-audit` accepts `{ status, agentId, marketId, fromTraceId,
  toTraceId, limit, cursor }` and returns `{ runs, findings, summary, cursor }`
  with `userKeys.traceAudit(scope, filter)`.
- `POST /admin/trace-audit/run` starts a bounded audit run and returns the run
  id; the console polls that id rather than assuming a synchronous response.
- Findings should carry `{ traceId, cid, digest, agentId, marketId, status,
  checkedAt, reason }`. `status` is one of `verified`, `mismatch`,
  `unavailable`, `linkage-only`. The frontend compares these by `(traceId, cid)`
  and reports disagreement when the browser result differs.
- Registry trace reads should support batched lookup by trace id. The frontend
  falls back to per-trace `get_trace` when a batch method is unavailable.
