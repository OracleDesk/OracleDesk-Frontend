"use client";
import { Icon } from "@/components/ui/icon";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RequireWallet } from "@/components/require-wallet";
import { useWallet } from "@/lib/contexts/WalletContext";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { usePlatformStats } from "@/lib/hooks/usePortfolio";
import { floatUsdcToRaw, formatUsdcDisplay } from "@/lib/format/money";
import { useAdminPermissions } from "@/lib/admin/useAdminPermissions";
import { DiagnosticsPanel } from "@/components/admin/diagnostics-panel";
import { JobStatusChip } from "@/components/admin/job-status-chip";
import { useAdminJobs } from "@/lib/admin/job-store";
import { formatLocalTime, shortJobId } from "@/lib/admin/job-events";
import { ApiError } from "@/lib/api/client";
import { getAdmins } from "@/lib/api/admin";
import { useUserScope } from "@/lib/query/scope";
import { userKeys } from "@/lib/query/keys";
import { useStepUpWindow } from "@/lib/auth/use-step-up-window";
import { shortAddress } from "@/lib/stellar/units";

/** First end-to-end step-up consumer: GET /admin/admins. */
function AdministratorsPanel() {
  const scope = useUserScope();
  const stepUp = useStepUpWindow();
  const query = useQuery({
    queryKey: [...userKeys.adminAdmins(scope), "step-up"] as const,
    queryFn: ({ signal }) => getAdmins({
      expectScope: scope,
      signal,
      stepUp: { reason: "view administrators" },
    }),
    enabled: Boolean(scope.wallet),
    staleTime: 30_000,
    retry: false,
  });

  const minutes = Math.floor(stepUp.secondsLeft / 60);
  const seconds = stepUp.secondsLeft % 60;
  const forbidden = query.error instanceof ApiError && query.error.status === 403 &&
    query.error.code !== "STEP_UP_REQUIRED";

  return (
    <section className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
      <div className="p-6 border-b border-outline-variant flex justify-between items-center">
        <h3 className="font-headline-sm text-headline-sm">Administrators</h3>
        <span className="font-data-mono text-[11px] text-on-surface-variant">
          {stepUp.fresh ? `Session fresh for ${minutes}:${String(seconds).padStart(2, "0")}` : "Re-authentication may be required"}
        </span>
      </div>
      <div className="p-6 text-sm">
        {query.isPending && <p className="text-on-surface-variant">Loading administrators…</p>}
        {forbidden && <p role="alert">You do not have permission to view administrators.</p>}
        {query.error && !forbidden && <p role="alert">{query.error instanceof Error ? query.error.message : "Could not load administrators."}</p>}
        {query.data && (query.data.length === 0 ? (
          <p className="text-on-surface-variant italic">No administrators found.</p>
        ) : (
          <ul className="space-y-2">
            {query.data.map((admin) => (
              <li key={admin.walletAddress} className="flex justify-between gap-4 font-data-mono">
                <span>{shortAddress(admin.walletAddress)}</span>
                <span>{admin.roleName}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}

/** Last five runs this browser started, from the job store (no polling here). */
function RecentGenerationRuns({ address }: { address: string | null }) {
  const { jobs } = useAdminJobs(address);
  const recent = jobs.slice(0, 5);
  return (
    <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
      <div className="p-6 border-b border-outline-variant flex justify-between items-center">
        <h3 className="font-headline-sm text-headline-sm">Recent generation runs</h3>
        <Link href="/admin/create" className="text-primary font-label-caps text-label-caps hover:underline">
          Track runs
        </Link>
      </div>
      {recent.length === 0 ? (
        <div className="p-8 text-center text-on-surface-variant italic">No runs started from this browser.</div>
      ) : (
        <ul className="divide-y divide-outline-variant">
          {recent.map((job) => (
            <li key={job.jobId} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <JobStatusChip status={job.lastStatus} />
                <span className="font-data-mono text-data-mono" title={job.jobId}>{shortJobId(job.jobId)}</span>
                {job.question && <span className="truncate text-on-surface-variant">{job.question}</span>}
              </div>
              <span className="text-[11px] text-on-surface-variant shrink-0">{formatLocalTime(job.startedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const AdminStat = ({ label, value, change }: { label: string, value: string, change?: string }) => (
  <div className="bg-white p-6 border border-outline-variant rounded-lg flex flex-col justify-between hover:shadow-md transition-all">
    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">{label}</span>
    <div className="flex items-baseline gap-2 mt-2">
      <span className="font-headline-md text-headline-md">{value}</span>
      {change && (
        <span className="text-on-surface-variant font-label-caps text-label-caps flex items-center">{change}</span>
      )}
    </div>
  </div>
);

const MarketItem = ({ title, status, volume, volumeLabel = "Liquidity" }: { title: string, status: string, volume: string, volumeLabel?: string }) => (
  <div className="flex items-center justify-between p-4 hover:bg-surface-container-low transition-colors border-b border-outline-variant last:border-0">
    <div>
      <p className="font-body-md font-bold text-on-surface">{title}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`w-2 h-2 rounded-full ${status === 'Active' ? 'bg-secondary' : 'bg-outline-variant'}`}></span>
        <span className="text-[11px] text-on-surface-variant uppercase font-label-caps">{status}</span>
      </div>
    </div>
    <div className="text-end">
      <p className="font-data-mono text-data-mono text-on-surface">{volume}</p>
      <p className="text-[11px] text-on-surface-variant uppercase font-label-caps text-[10px]">{volumeLabel}</p>
    </div>
  </div>
);

export default function AdminDashboard() {
  return (
    <RequireWallet
      title="Restricted Access"
      description="The Admin Control Center requires a secure wallet connection for institutional authentication."
    >
      <AdminContent />
    </RequireWallet>
  );
}

function AdminContent() {
  const { address, disconnect, openModal } = useWallet();
  const { can, isLoading: isPermissionsLoading, isDevelopmentFallback } = useAdminPermissions();
  const { data: marketsData, isLoading } = useMarkets({ limit: 10 });
  const { data: stats } = usePlatformStats();
  const markets = marketsData?.markets ?? [];

  // Gate on admin.read permission derived from backend RBAC
  const isAuthorized = can("admin.read");

  if (isPermissionsLoading) {
    return (
      <main className="flex-grow flex items-center justify-center p-gutter">
        <div className="p-8 text-center text-on-surface-variant font-label-caps animate-pulse">
          Resolving administrative authorization…
        </div>
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="flex-grow flex items-center justify-center p-gutter">
        <div className="max-w-md w-full text-center space-y-6 bg-white p-10 rounded-xl border border-outline-variant shadow-sm">
          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <Icon name="block" className="text-4xl" />
          </div>
          <div className="space-y-2">
            <h2 className="font-headline-md text-headline-md">Access Denied</h2>
            <p className="text-on-surface-variant">
              Your wallet address is not authorized to access the Admin Control Center. This page is restricted to authorized team members only.
            </p>
            <p className="text-on-surface-variant text-sm mt-4 font-data-mono break-all">
              {address}
            </p>
          </div>
          <button
            // Disconnect first so the kit's picker lets the user choose another account.
            onClick={() => void disconnect().then(() => openModal())}
            className="w-full bg-outline text-on-outline py-4 rounded-lg font-label-caps text-label-caps hover:brightness-90 transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <Icon name="swap_horiz" />
            SWITCH WALLET
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow max-w-container-max-width mx-auto px-gutter py-12 w-full space-y-8">
      {isDevelopmentFallback && (
        <div role="note" className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 text-xs flex items-center gap-2">
          <Icon name="warning" className="text-sm" />
          <span>DEVELOPMENT FALLBACK: Gated by local environment addresses, not real backend authorization. Never active in production.</span>
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div className="space-y-2">
          <h1 className="font-display-lg text-display-lg text-primary text-4xl">Admin Control Center</h1>
          <p className="text-on-surface-variant font-body-lg text-body-lg">
            Monitor protocol health and manage institutional prediction markets.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {can("markets.generate") && (
            <Link 
              href="/admin/create" 
              className="bg-primary text-primary-foreground px-6 py-4 rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all shadow-lg"
            >
              <Icon name="add_circle" />
              CREATE NEW MARKET
            </Link>
          )}
          {can("agents.manage") && (
            <Link
              href="/admin/agents"
              className="border border-outline text-on-surface px-6 py-4 rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:bg-surface-container-low transition-all"
            >
              <Icon name="smart_toy" />
              MANAGE AGENTS
            </Link>
          )}
          {can("admin.read") && (
            <Link
              href="/admin/roles"
              className="border border-outline text-on-surface px-6 py-4 rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:bg-surface-container-low transition-all"
            >
              <Icon name="verified_user" />
              ROLES &amp; ACCESS
            </Link>
          )}
          {can("reconciliation.run") && (
            <Link
              href="/admin/reconciliation"
              className="border border-outline text-on-surface px-6 py-4 rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:bg-surface-container-low transition-all"
            >
              <Icon name="find_match" />
              RECONCILIATION
            </Link>
          )}
        </div>
        <Link 
          href="/admin/create" 
          className="bg-primary text-primary-foreground px-6 py-4 rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all shadow-lg"
        >
          <Icon name="add_circle" />
          CREATE NEW MARKET
        </Link>
        <Link
          href="/admin/treasury"
          className="border border-primary text-primary px-6 py-4 rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:bg-primary/10 transition-all font-bold"
        >
          <Icon name="account_balance" />
          TREASURY CONSOLE
        </Link>
        <Link
          href="/admin/agents"
          className="border border-outline text-on-surface px-6 py-4 rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:bg-surface-container-low transition-all"
        >
          <Icon name="smart_toy" />
          MANAGE AGENTS
        </Link>
        <Link
          href="/admin/contracts"
          className="border border-outline text-on-surface px-6 py-4 rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:bg-surface-container-low transition-all"
        >
          <Icon name="fact_check" />
          CONTRACTS MATRIX
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <AdminStat
          label="Copy-trade volume"
          value={
            stats
              ? (() => {
                  const raw = floatUsdcToRaw(stats.totalCopyVolume);
                  return raw !== null ? formatUsdcDisplay(raw) : "—";
                })()
              : "—"
          }
          change={stats ? "backend record" : undefined}
        />
        <AdminStat label="Markets (backend db)" value={stats ? String(stats.marketCount) : "—"} change={stats ? `${stats.onChainMarketCount} on-chain ids` : undefined} />
        <AdminStat label="Users" value={stats ? String(stats.subscriberCount) : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12 space-y-6">
          <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center">
              <h3 className="font-headline-sm text-headline-sm">Active Markets</h3>
              <button className="text-primary font-label-caps text-label-caps hover:underline">View All</button>
            </div>
            <div className="divide-y divide-outline-variant">
              {isLoading ? (
                <div className="p-8 text-center text-on-surface-variant animate-pulse">Loading markets...</div>
              ) : markets.length > 0 ? (
                markets.map((m) => {
                  const hasSeed = Boolean(m.seedAmountRaw);
                  const rawLiq = hasSeed ? BigInt(m.seedAmountRaw!) : floatUsdcToRaw(m.totalLiquidity);
                  return (
                    <MarketItem 
                      key={m.id}
                      title={m.question} 
                      status={m.status === 'ACTIVE' ? 'Active' : m.status.charAt(0) + m.status.slice(1).toLowerCase()} 
                      volume={rawLiq !== null ? formatUsdcDisplay(rawLiq) : "—"}
                      volumeLabel={hasSeed ? "Liquidity (seed)" : "Liquidity (backend record)"}
                    />
                  );
                })
              ) : (
                <div className="p-8 text-center text-on-surface-variant italic">No markets found. Deploy one to get started.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <RecentGenerationRuns address={address} />

      <AdministratorsPanel />

      <DiagnosticsPanel />
    </main>
  );
}
