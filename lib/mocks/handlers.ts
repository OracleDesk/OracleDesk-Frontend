/**
 * MSW request handlers for preview / mock mode (issue #151).
 *
 * These handlers intercept every fetch that the app makes and return canned
 * responses that match the backend's `{ ok, data, error, meta }` envelope
 * (documented in docs/api.md). They also stub the Soroban RPC JSON-RPC
 * endpoint so on-chain reads work without a live node.
 *
 * This file is imported only when NEXT_PUBLIC_PREVIEW_MODE=1 at build time.
 * The tree-shaker removes it entirely from production bundles because all
 * import paths that reach it are guarded by `if (flags.previewModeEnabled)`.
 */

import { http, HttpResponse, delay } from "msw";

// ─── helpers ─────────────────────────────────────────────────────────────────

function ok<T>(data: T, meta?: Record<string, unknown>) {
  return HttpResponse.json({ ok: true, data, error: null, meta: meta ?? null });
}

// ─── fixture data ─────────────────────────────────────────────────────────────

const MOCK_MARKETS = [
  {
    id: "mock-market-1",
    question: "Will BTC close above $100k by end of Q1 2026?",
    category: "CRYPTO",
    status: "ACTIVE",
    onChainMarketId: "MOCK_CHAIN_ID_1",
    yesProb: 0.62,
    resolvedOutcome: null,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    createdAt: new Date().toISOString(),
    reasoningTraces: [],
  },
  {
    id: "mock-market-2",
    question: "Will the Fed cut rates in November 2025?",
    category: "MACRO",
    status: "ACTIVE",
    onChainMarketId: "MOCK_CHAIN_ID_2",
    yesProb: 0.45,
    resolvedOutcome: null,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
    createdAt: new Date().toISOString(),
    reasoningTraces: [],
  },
];

const MOCK_TRACES = [
  {
    id: "mock-trace-1",
    question: "Analyzing BTC Q1 2026 outlook",
    onChainTraceId: "MOCK_TRACE_CHAIN_1",
    createdAt: new Date().toISOString(),
    modelId: "claude-3-5-sonnet",
    confidence: 0.75,
  },
];

const MOCK_USER = {
  address: "GDMOCKADDRESS000000000000000000000000000000000000000000",
  premiumUntil: null,
  role: "user",
};

// ─── handlers ─────────────────────────────────────────────────────────────────

export const handlers = [
  // Markets
  http.get("*/api/v1/markets", async () => {
    await delay(80);
    return ok(MOCK_MARKETS, { total: MOCK_MARKETS.length, page: 1, limit: 24 });
  }),

  http.get("*/api/v1/markets/on-chain/:id", async ({ params }) => {
    await delay(60);
    const market = MOCK_MARKETS.find((m) => m.onChainMarketId === params.id);
    if (!market) return HttpResponse.json({ ok: false, data: null, error: { code: "NOT_FOUND", message: "Market not found" }, meta: null }, { status: 404 });
    return ok(market);
  }),

  // Traces
  http.get("*/api/v1/traces", async () => {
    await delay(80);
    return ok(MOCK_TRACES, { total: MOCK_TRACES.length });
  }),

  http.get("*/api/v1/traces/:id", async ({ params }) => {
    await delay(60);
    const trace = MOCK_TRACES.find((t) => t.id === params.id);
    if (!trace) return HttpResponse.json({ ok: false, data: null, error: { code: "NOT_FOUND", message: "Trace not found" }, meta: null }, { status: 404 });
    return ok(trace);
  }),

  // Auth
  http.get("*/api/v1/auth/challenge", async () => {
    await delay(30);
    return ok({ xdr: "MOCK_XDR_CHALLENGE_0000000000000000000000000000000000000000" });
  }),

  http.post("*/api/v1/auth/login", async () => {
    await delay(60);
    return ok({ token: "mock-jwt-token", walletAddress: MOCK_USER.address });
  }),

  // Portfolio / user
  http.get("*/api/v1/users/me", async () => {
    await delay(40);
    return ok(MOCK_USER);
  }),

  http.get("*/api/v1/portfolio/positions", async () => {
    await delay(60);
    return ok([]);
  }),

  // Health
  http.get("*/api/v1/health", async () => {
    await delay(20);
    return ok({ status: "ok", version: "mock" });
  }),

  // Soroban RPC (JSON-RPC POST)
  http.post("*/soroban/rpc", async ({ request }) => {
    await delay(40);
    const body = await request.json() as { method?: string; id?: unknown };
    const method = body?.method ?? "unknown";
    const id = body?.id ?? 1;

    // Return minimal valid responses for the methods the app uses.
    if (method === "getLedgerEntries") {
      return HttpResponse.json({ jsonrpc: "2.0", id, result: { entries: [], latestLedger: "999999" } });
    }
    if (method === "simulateTransaction") {
      return HttpResponse.json({ jsonrpc: "2.0", id, result: { results: [{ xdr: "" }], cost: { cpuInsns: "0", memBytes: "0" }, latestLedger: "999999" } });
    }
    if (method === "sendTransaction") {
      return HttpResponse.json({ jsonrpc: "2.0", id, result: { status: "PENDING", hash: "MOCK_TX_HASH_0000000000000000000000000000000000000000000000000000000000" } });
    }
    if (method === "getTransaction") {
      return HttpResponse.json({ jsonrpc: "2.0", id, result: { status: "SUCCESS", ledger: 999999, createdAt: Math.floor(Date.now() / 1000) } });
    }

    return HttpResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }),
];
