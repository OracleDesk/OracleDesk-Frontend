"use client";
import { Icon } from "@/components/ui/icon";

import React, { useCallback, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useDirection } from "@/components/layout/DirectionProvider";
import { slideIn } from "@/lib/motion/directional";
import { useBurstFeed } from "@/lib/realtime/useBurst";
import { formatFeedTime } from "@/lib/realtime/format";
import { RealtimeProfiler } from "@/components/realtime-profiler";
import Link from "next/link";
import { useMarkets, useInfiniteMarkets, useMarketQuestionIntegrity } from "@/lib/hooks/useMarkets";
import { useOnChainMarket, useOnChainMarkets, type OnChainMarketView } from "@/lib/hooks/useStellar";
import type { Market, MarketStatus, MarketTracePreview } from "@/lib/api/markets";
import { floatUsdcToRaw, formatBps, formatUsdcDisplay } from "@/lib/format/money";
import { BACKEND_CATEGORIES, BACKEND_CATEGORY_LABELS } from "@/lib/stellar/categories";
import { NETWORK_LABEL } from "@/lib/stellar/config";
import { VirtualList } from "@/components/ui/virtual-list";
import { QuestionVerificationBadge } from "@/components/question-verification-badge";
import { SafeText } from "@/components/safe-text";
import { bytesToHex } from "@/lib/stellar/typed-call";
import { userMessage } from "@/lib/errors/display";
import { SourceTag } from "@/components/ui/source-tag";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { useProvisionalPrice } from "@/lib/realtime/RealtimeProvider";
import type { Route } from "next";
import { parseBackendMarketId, parseOnChainMarketId, routes } from "@/lib/routes";
import { sharedMarketEventCache } from "@/lib/stellar/market-activity";
import { reconcileDisplayPrice } from "@/lib/realtime/market-price-store";
import { useBreaker } from "@/lib/hooks/useBreaker";
import { breakerLimits } from "@/lib/stellar/breaker";
import { bpsToPercent } from "@/lib/stellar/units";

function chainStatusLabel(view: OnChainMarketView | undefined): string {
  if (!view) return "—";
  const status = view.market.status;
  if (status.tag === "Resolved") return `Resolved ${status.values[0].tag.toUpperCase()}`;
  return status.tag === "Void" ? "Voided" : "Open";
}

const FilterBar = ({ 
  status, 
  setStatus, 
  category, 
  setCategory 
}: { 
  status: string; 
  setStatus: (s: string) => void;
  category: string;
  setCategory: (c: string) => void;
}) => {
  return (
    <section className="mb-8 bg-surface-container-low p-4 rounded-xl border border-outline-variant">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-grow min-w-[240px]">
            <Icon name="search" className="absolute start-3 top-1/2 -translate-y-1/2 text-outline" />
            <input 
              className="w-full ps-10 pe-4 py-2 bg-surface border border-outline-variant rounded-lg text-body-md focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all" 
              placeholder="Search markets, assets, or events..." 
              type="text"
            />
          </div>
          <select 
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-surface border border-outline-variant rounded-lg px-4 py-2 text-label-caps font-label-caps outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            <option value="">All Categories</option>
            {BACKEND_CATEGORIES.map((c) => (
              <option key={c} value={c}>{BACKEND_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex bg-surface-container rounded-lg p-1 border border-outline-variant">
            <button 
              onClick={() => setStatus("ACTIVE")}
              className={`px-4 py-1.5 text-label-caps font-label-caps shadow-sm rounded-md transition-all ${status === "ACTIVE" ? "bg-surface text-primary font-bold" : "text-on-surface-variant hover:text-primary"}`}
            >
              Live
            </button>
            <button 
              onClick={() => setStatus("RESOLVED")}
              className={`px-4 py-1.5 text-label-caps font-label-caps shadow-sm rounded-md transition-all ${status === "RESOLVED" ? "bg-surface text-primary font-bold" : "text-on-surface-variant hover:text-primary"}`}
            >
              Resolved
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse motion-reduce:animate-none"></span>
            <span className="font-data-mono text-label-caps text-secondary uppercase">{NETWORK_LABEL}</span>
          </div>
        </div>
      </div>
    </section>
  );
};

interface MarketCardProps {
  href: Route;
  yesHref: Route;
  noHref: Route;
  category: string;
  onChainMarketId: string | null;
  reasoningTraces?: MarketTracePreview[];
  expiry: string;
  title: string;
  backendYesProb?: number | null;
  backendLiquidity: string | null;
  marketId?: string | null;
  metaUri?: string | null;
  questionHash?: string | null;
  disableEntrance?: boolean;
}

const MarketCard = ({ href, yesHref, noHref, category, onChainMarketId, reasoningTraces, expiry, title, backendYesProb, backendLiquidity, disableEntrance, marketId, metaUri, questionHash }: MarketCardProps) => {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !disableEntrance && !reduceMotion;
  const chain = useOnChainMarket(onChainMarketId);
  const breakerState = useBreaker(onChainMarketId ?? "", Boolean(onChainMarketId));
  const breaker = breakerLimits(breakerState.data?.config);
  const breakerEnabled = breaker.impactBps > 0n || breaker.bandBps > 0n;
  const view = chain.data;
  const fromChain = Boolean(view);
  const provisional = useProvisionalPrice(onChainMarketId);
  const baseYesBps = view ? view.yesBps : (backendYesProb !== null && backendYesProb !== undefined ? Math.round(backendYesProb * 100) : 5000);
  const reconciled = reconcileDisplayPrice(baseYesBps, view?.ledger, provisional);
  const yesProb = Math.round(reconciled.priceYesBps / 100);
  const noProb = 100 - yesProb;
  const isProvisional = reconciled.isProvisional;
  const priceSource: "chain" | "backend" | "provisional" = isProvisional ? "provisional" : fromChain ? "chain" : "backend";
  const priceLedger = isProvisional ? reconciled.ledger : view?.ledger ?? null;
  const priceReadAt = isProvisional ? provisional?.receivedAt : fromChain ? chain.dataUpdatedAt : undefined;

  const liquidity = view
    ? formatUsdcDisplay(view.market.sets_minted)
    : backendLiquidity ?? "—";
  const activity = onChainMarketId !== null ? sharedMarketEventCache.getActivity(onChainMarketId) : null;
  const activityVolumeText = activity?.status === "ready" ? formatUsdcDisplay(activity.volume24h) : "—";
  const activityFeesText = activity?.status === "ready" ? formatUsdcDisplay(activity.fees24h) : "—";
  const platform = onChainMarketId !== null ? `On-chain #${onChainMarketId}` : "Not on-chain yet";
  const latestTrace = reasoningTraces?.[0];
  const aiSignal = latestTrace ? (latestTrace.edge > 0.05 ? "BULLISH" : latestTrace.edge < -0.05 ? "BEARISH" : "NEUTRAL") : "ANALYZING";
  const aiStatus = latestTrace ? `${Math.abs(latestTrace.edge * 100).toFixed(1)}% EDGE` : "STABLE";
  const volume24h = chainStatusLabel(view);

  const questionIntegrity = useMarketQuestionIntegrity({
    marketId,
    onChainMarketId,
    displayedQuestion: title,
    metaUri: view?.market.meta_uri ?? null,
    questionHash: view?.market.question_hash ?? null,
    hasChainRead: fromChain,
    chainMarket: view?.market,
  });

  const displayTitle = questionIntegrity.data?.status === "verified" && questionIntegrity.data.committedQuestion
    ? questionIntegrity.data.committedQuestion
    : title;

  const cardContent = (
    <>
      <div className="p-5 flex-grow">
        <div className="flex justify-between items-start mb-4">
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded text-label-caps font-bold uppercase tracking-wider ${onChainMarketId !== null ? 'bg-primary-container text-on-primary-container border border-primary/20' : 'bg-surface-container-highest text-on-surface-variant'}`}>
              {platform}
            </span>
            <span className="bg-surface-container-highest text-on-surface-variant px-2 py-1 rounded text-label-caps font-bold uppercase tracking-wider">{category}</span>
            <div className={`flex items-center gap-1 px-2 py-1 rounded ${aiSignal === 'NEUTRAL' || aiSignal === 'ANALYZING' ? 'bg-surface-container-highest' : aiSignal === 'BEARISH' ? 'bg-tertiary-fixed/30' : 'bg-secondary-fixed/30'}`}>
              <Icon
                name={aiSignal === 'ANALYZING' ? 'sync' : aiSignal === 'NEUTRAL' ? 'psychology' : aiSignal === 'BULLISH' ? 'trending_up' : 'trending_down'}
                filled
                className="text-[14px]"
              />
              <span className={`${aiSignal === 'NEUTRAL' || aiSignal === 'ANALYZING' ? 'text-on-surface-variant' : aiSignal === 'BEARISH' ? 'text-tertiary' : 'text-secondary'} text-label-caps font-bold uppercase`}>
                AI {aiSignal}: {aiStatus}
              </span>
            </div>
            {questionIntegrity.data && (
              <QuestionVerificationBadge
                status={questionIntegrity.data.status}
                result={questionIntegrity.data}
                displayedText={title}
                compact={true}
              />
            )}
          </div>
          <span className="font-data-mono text-label-caps text-on-surface-variant">EXP: {expiry}</span>
        </div>

        {questionIntegrity.data?.status === "mismatch" && (
          <div className="mb-3">
            <QuestionVerificationBadge status="mismatch" result={questionIntegrity.data} displayedText={title} />
          </div>
        )}

        <Link href={href} className="block">
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-6 group-hover:text-primary transition-colors line-clamp-3">
            <SafeText text={title} />
            {displayTitle}
          </h3>
        </Link>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-label-caps font-label-caps mb-2">
              <span className="text-secondary">YES {yesProb}%<SourceTag source={priceSource} ledger={priceLedger} readAt={priceReadAt} /></span>
              <span className="text-tertiary">NO {noProb}%</span>
            </div>
            <ProbabilityBar yes={yesProb} no={noProb} heightClassName="h-2" />
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-outline-variant/30 pt-4">
            <div>
              <p className="text-label-caps text-on-surface-variant uppercase mb-1">Liquidity<SourceTag source={fromChain ? "chain" : "backend"} /></p>
              <p className="font-data-mono text-body-md">{liquidity}</p>
            </div>
            <div>
              <p className="text-label-caps text-on-surface-variant uppercase mb-1">On-chain status</p>
              <p className={`font-data-mono text-body-md ${volume24h === 'Open' ? 'text-secondary' : 'text-on-surface-variant'}`}>
                {chain.isLoading ? "…" : volume24h}
              </p>
            </div>
            <div>
              <p className="text-label-caps text-on-surface-variant uppercase mb-1">
                24h Vol{activity?.partial ? " (partial)" : ""}
              </p>
              <p className="font-data-mono text-body-md">{activityVolumeText}</p>
            </div>
            <div>
              <p className="text-label-caps text-on-surface-variant uppercase mb-1">
                24h Fees · Traders
              </p>
              <p className="font-data-mono text-body-md">
                {activity?.status === "ready" ? `${activityFeesText} · ${activity.uniqueTraders}` : "Unavailable"}
              </p>
            </div>
            {breakerEnabled && (
              <div className="col-span-2">
                <p className="text-label-caps text-on-surface-variant uppercase mb-1">Price breakers</p>
                <p className="font-data-mono text-body-md">
                  Impact ≤ {bpsToPercent(breaker.impactBps, 0)} · Band ≤ {bpsToPercent(breaker.bandBps, 0)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2 bg-surface-container-low border-t border-outline-variant">
        <Link href={yesHref} className="bg-secondary text-primary-foreground py-2.5 rounded-lg font-label-caps text-label-caps font-bold hover:brightness-110 active:opacity-80 transition-all uppercase text-center">Bet Yes</Link>
        <Link href={noHref} className="bg-tertiary text-primary-foreground py-2.5 rounded-lg font-label-caps text-label-caps font-bold hover:brightness-110 active:opacity-80 transition-all uppercase text-center">Bet No</Link>
      </div>
    </>
  );

  const containerClass = "group bg-surface border border-outline-variant rounded-xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all flex flex-col";

  return shouldAnimate ? (
    <motion.div whileHover={{ y: -4 }} className={containerClass}>
      {cardContent}
    </motion.div>
  ) : (
    <div className={`${containerClass} hover:-translate-y-1`}>
      {cardContent}
    </div>
  );
};

const TradingFeed = () => {
  const { rows, burst } = useBurstFeed({ capacity: 8, type: "TRADE_EXECUTED" });
  const reduceMotion = useReducedMotion();
  const dir = useDirection();
  const feed = rows.flatMap(event => {
    if (event.type !== "TRADE_EXECUTED") return [];
    const data = event.payload;
    return [{
      key: data.eventId,
      time: formatFeedTime(data.closedAt ?? event.receivedAt) + (data.closedAt ? "" : " received"),
      market: data.marketQuestion || `Market #${data.onChainMarketId}`,
      size: formatUsdcDisplay(BigInt(data.collateralRaw)),
      bet: `${data.isBuy ? "BUY" : "SELL"} ${data.direction}`,
      prob: `YES ${formatBps(data.priceYesBps)}`,
      color: data.direction === "YES" ? "text-secondary" : "text-tertiary",
    }];
  });
  const animate = !reduceMotion && !burst;
  const tableRows = feed.map(row => {
    const cells = <>
      <td className="py-3 text-on-surface-variant">{row.time}</td>
      <td className="py-3">{row.market}</td>
      <td className="py-3 text-end">{row.size}</td>
      <td className={`py-3 text-end ${row.color} font-bold`}>{row.bet}</td>
      <td className="py-3 text-end">{row.prob}</td>
    </>;
    const className = "hover:bg-surface-container transition-colors border-b border-outline-variant/30";
    return animate
      ? <motion.tr key={row.key} {...slideIn(dir, 20)} className={className}>{cells}</motion.tr>
      : <tr key={row.key} className={className}>{cells}</tr>;
  });

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="analytics" className="text-primary" />
        <h2 className="font-headline-sm text-headline-sm uppercase tracking-tight">Real-time Trading Feed</h2>
      </div>
      {burst && <p className="text-xs text-on-surface-variant mb-2">{burst.count} trades in the last second{burst.overflow ? ` · ${burst.overflow} more events while this tab was hidden` : ""}.</p>}
      <div className="terminal-log-flow border border-outline-variant rounded-xl overflow-hidden bg-white">
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-start">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="pb-3 text-label-caps text-on-surface-variant">Time</th>
                <th className="pb-3 text-label-caps text-on-surface-variant">Market</th>
                <th className="pb-3 text-label-caps text-on-surface-variant text-end">Size</th>
                <th className="pb-3 text-label-caps text-on-surface-variant text-end">Bet</th>
                <th className="pb-3 text-label-caps text-on-surface-variant text-end">Probability</th>
              </tr>
            </thead>
            <tbody key={animate ? "animated" : "static"} className="font-data-mono text-body-md">
              {feed.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">Waiting for on-chain trades…</td></tr>}
              {animate ? <AnimatePresence initial={false}>{tableRows}</AnimatePresence> : tableRows}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

function OnChainOnlyMarkets({ knownIds }: { knownIds: Set<string> }) {
  const { data, isLoading, error } = useOnChainMarkets(12);
  const orphans = (data ?? []).filter((v) => !knownIds.has(v.id));
  if (isLoading || error || orphans.length === 0) return null;
  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="link" className="text-primary" />
        <h2 className="font-headline-sm text-headline-sm uppercase tracking-tight">On-chain markets without OracleDesk metadata</h2>
      </div>
      <p className="text-on-surface-variant text-sm mb-4">
        These markets exist on the market contract but the backend has no record of them, so only on-chain data is shown.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {orphans.map((v) => {
          const parsedChainId = parseOnChainMarketId(v.id);
          const qvHref = parsedChainId ? routes.marketsQuickView({ onChainId: parsedChainId, from: "markets" }) : routes.markets();
          const yesHref = parsedChainId ? routes.marketsQuickView({ onChainId: parsedChainId, from: "markets", side: "YES" }) : routes.markets();
          const noHref = parsedChainId ? routes.marketsQuickView({ onChainId: parsedChainId, from: "markets", side: "NO" }) : routes.markets();
          return (
          <MarketCard
            key={v.id}
            href={qvHref}
            yesHref={yesHref}
            noHref={noHref}
            category={v.market.category.tag}
            onChainMarketId={v.id}
            expiry={new Date(Number(v.market.close_time) * 1000).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).toUpperCase()}
            title={`Market #${v.id} · ${v.market.meta_uri}`}
            backendYesProb={null}
            backendLiquidity={null}
            metaUri={v.market.meta_uri}
            questionHash={v.market.question_hash ? bytesToHex(v.market.question_hash) : null}
          />
          );
        })}
      </div>
    </section>
  );
}

export default function MarketsPageClient() {
  const [status, setStatus] = useState<MarketStatus>("ACTIVE");
  const [category, setCategory] = useState<string>("");
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteMarkets({ 
    status, 
    category: (category || undefined) as Market["category"] | undefined,
    limit: 24,
  });

  const marketsData = useMemo(
    () => data?.pages.flatMap((p) => p.markets) ?? [],
    [data]
  );
  const totalCount = data?.pages[0]?.meta?.total ?? marketsData.length;
  const knownIds = useMemo(
    () => new Set(marketsData.flatMap((m) => (m.onChainMarketId ? [m.onChainMarketId] : []))),
    [marketsData]
  );

  // Stable callback: avoids a new function identity on every render so the
  // React Compiler (and manual memoization on FilterBar) can optimise correctly.
  const handleSetStatus = useCallback(
    (s: string) => setStatus(s as MarketStatus),
    [],
  );

  return (
    <div className="min-h-screen bg-surface">
      <main className="pt-24 pb-12 px-gutter max-w-container-max-width mx-auto">
        <h1 id="markets-heading" tabIndex={-1} className="sr-only outline-none">
          Markets
        </h1>
        <FilterBar
          status={status}
          setStatus={handleSetStatus}
          category={category}
          setCategory={setCategory}
        />
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-surface-container-low animate-pulse motion-reduce:animate-none rounded-xl border border-outline-variant"></div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-surface-container-low rounded-xl border border-error/20">
            <Icon name="error" className="text-error text-4xl mb-4" />
            <p className="text-on-surface-variant font-medium">Failed to load markets.</p>
            <p className="text-on-surface-variant/70 text-sm mt-2">
              {userMessage(error)}
            </p>
            {typeof navigator !== "undefined" && navigator.onLine === false && (
              <p className="text-on-surface-variant text-sm mt-2">You appear to be offline. Reconnect, then retry.</p>
            )}
            <button 
              onClick={() => void refetch()}
              disabled={isFetching}
              className="mt-6 px-4 py-2 bg-primary text-white rounded-lg font-label-caps text-label-caps disabled:opacity-60"
            >
              {isFetching ? "Retrying…" : "Retry Connection"}
            </button>
          </div>
        ) : marketsData.length === 0 ? (
          <div className="text-center py-12 bg-surface-container-low rounded-xl border border-outline-variant text-on-surface-variant">
            No markets match these filters yet.
          </div>
        ) : (
          <div>
            <VirtualList<Market>
              items={marketsData}
              totalCount={totalCount}
              getKey={(m) => m.id}
              estimateSize={() => 280}
              columns={{ base: 1, md: 2, xl: 3 }}
              overscan={3}
              role="feed"
              ariaLabel="Prediction markets"
              restorationKey="markets_grid"
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  void fetchNextPage();
                }
              }}
              renderItem={(m, _idx, a11y) => {
                const rawProb = m.currentYesProb ?? m.initialYesProb;
                const hasSeed = Boolean(m.seedAmountRaw);
                const rawLiq = hasSeed ? BigInt(m.seedAmountRaw!) : floatUsdcToRaw(m.totalLiquidity);
                const parsedBackendId = parseBackendMarketId(m.id);
                const qvHref = parsedBackendId ? routes.marketsQuickView({ marketId: parsedBackendId, from: "markets" }) : routes.markets();
                const yesHref = parsedBackendId ? routes.marketsQuickView({ marketId: parsedBackendId, from: "markets", side: "YES" }) : routes.markets();
                const noHref = parsedBackendId ? routes.marketsQuickView({ marketId: parsedBackendId, from: "markets", side: "NO" }) : routes.markets();
                return (
                  <div {...a11y}>
                    <MarketCard 
                      href={qvHref}
                      yesHref={yesHref}
                      noHref={noHref}
                      category={m.category}
                      onChainMarketId={m.onChainMarketId}
                      reasoningTraces={m.reasoningTraces}
                      expiry={new Date(m.expiryTimestamp).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).toUpperCase()}
                      title={m.question}
                      backendLiquidity={rawLiq !== null ? `${formatUsdcDisplay(rawLiq)}${hasSeed ? " (seed)" : " (backend record)"}` : "—"}
                      disableEntrance
                      marketId={m.id}
                      metaUri={m.metaUri}
                      questionHash={m.questionHash}
                    />
                  </div>
                );
              }}
            />
            {isFetchingNextPage && (
              <div className="py-6 text-center text-on-surface-variant font-label-caps text-sm">
                Loading more markets…
              </div>
            )}
          </div>
        )}

        <OnChainOnlyMarkets knownIds={knownIds} />
        <RealtimeProfiler id="TradingFeed"><TradingFeed /></RealtimeProfiler>
      </main>
    </div>
  );
}
