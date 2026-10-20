"use client";

/**
 * Global command palette (issue #149).
 *
 * Keyboard shortcut: Ctrl/Cmd+K  — opens from anywhere.
 * Built on the WAI-ARIA combobox pattern so keyboard-only and screen-reader
 * users can navigate, trade and manage their wallet without a mouse.
 *
 * Architecture
 * ─────────────
 * • A single <CommandPalette> renders in app/layout.tsx, outside <Navbar>.
 * • It is always mounted; the dialog element is hidden until the shortcut fires.
 * • Actions (navigate, copy address, disconnect …) are defined as plain data;
 *   market/trace results are fetched lazily after ≥2 chars of input.
 * • Every destructive/wallet action goes through the same hooks the pages use
 *   (useWalletActions, useWalletAddress) so the review UI and confirmation
 *   steps are identical.
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { useTraces } from "@/lib/hooks/useTraces";
import { useWalletActions, useWalletAddress } from "@/lib/stellar/WalletProvider";

// ─── types ──────────────────────────────────────────────────────────────────

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  group: "nav" | "wallet" | "market" | "trace";
  onSelect: () => void | Promise<void>;
}

// ─── static items ────────────────────────────────────────────────────────────

function useStaticItems(
  router: ReturnType<typeof useRouter>,
  address: string | null,
  actions: ReturnType<typeof useWalletActions>,
): CommandItem[] {
  return [
    { id: "nav-markets", label: "Go to Markets", icon: "bar_chart", group: "nav", onSelect: () => router.push("/markets") },
    { id: "nav-portfolio", label: "Go to Portfolio", icon: "account_balance_wallet", group: "nav", onSelect: () => router.push("/portfolio") },
    { id: "nav-reasoning", label: "Go to Reasoning", icon: "psychology", group: "nav", onSelect: () => router.push("/reasoning") },
    { id: "nav-stats", label: "Go to Stats", icon: "analytics", group: "nav", onSelect: () => router.push("/stats") },
    { id: "nav-premium", label: "Go to Premium", icon: "workspace_premium", group: "nav", onSelect: () => router.push("/premium") },
    { id: "nav-settings", label: "Go to Settings", icon: "settings", group: "nav", onSelect: () => router.push("/settings") },
    ...(address
      ? [
          {
            id: "wallet-copy",
            label: "Copy wallet address",
            description: address ? `${address.slice(0, 8)}…${address.slice(-4)}` : undefined,
            icon: "content_copy",
            group: "wallet" as const,
            onSelect: () => void navigator.clipboard.writeText(address),
          },
          {
            id: "wallet-disconnect",
            label: "Disconnect wallet",
            icon: "logout",
            group: "wallet" as const,
            onSelect: () => void actions.disconnect(),
          },
        ]
      : [
          {
            id: "wallet-connect",
            label: "Connect wallet",
            icon: "account_balance_wallet",
            group: "wallet" as const,
            onSelect: () => void actions.openModal(),
          },
        ]),
  ];
}

// ─── group labels ─────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<CommandItem["group"], string> = {
  nav: "Navigation",
  wallet: "Wallet",
  market: "Markets",
  trace: "Traces",
};

// ─── main component ───────────────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter();
  const { address } = useWalletAddress();
  const actions = useWalletActions();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const listboxId = useId();
  const inputId = useId();

  // ── keyboard shortcut ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ── static items (stable reference while address doesn't change) ───────────

  const staticItems = useStaticItems(router, address, actions);

  // ── lazy market / trace search ─────────────────────────────────────────────

  const shouldSearch = query.length >= 2;

  const { data: marketsData } = useMarkets(
    shouldSearch ? { status: "ACTIVE", limit: 5 } : null,
  );
  const { data: tracesData } = useTraces(
    shouldSearch ? { limit: 5 } : null,
  );

  const marketItems: CommandItem[] = (marketsData?.markets ?? [])
    .filter((m) => m.question.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5)
    .map((m) => ({
      id: `market-${m.id}`,
      label: m.question,
      description: m.category,
      icon: "bar_chart",
      group: "market" as const,
      onSelect: () => router.push(m.onChainMarketId ? `/market?onChainId=${m.onChainMarketId}` : `/markets`),
    }));

  const traceItems: CommandItem[] = (tracesData?.traces ?? [])
    .filter((t) => ("question" in t ? (t.question as string).toLowerCase().includes(query.toLowerCase()) : true))
    .slice(0, 5)
    .map((t) => ({
      id: `trace-${t.id}`,
      label: "question" in t ? (t.question as string) : t.id,
      icon: "psychology",
      group: "trace" as const,
      onSelect: () => router.push(`/reasoning/verify?traceId=${t.id}`),
    }));

  // ── filter and group ───────────────────────────────────────────────────────

  const allItems: CommandItem[] = [
    ...staticItems.filter(
      (item) =>
        !query ||
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        (item.description?.toLowerCase().includes(query.toLowerCase()) ?? false),
    ),
    ...marketItems,
    ...traceItems,
  ];

  const grouped = allItems.reduce<Map<CommandItem["group"], CommandItem[]>>(
    (acc, item) => {
      const list = acc.get(item.group) ?? [];
      list.push(item);
      acc.set(item.group, list);
      return acc;
    },
    new Map(),
  );

  // flat index used for keyboard navigation
  const flatItems = [...grouped.values()].flat();

  // ── keyboard navigation inside the palette ─────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) {
          void item.onSelect();
          setOpen(false);
        }
      }
    },
    [flatItems, activeIndex],
  );

  // scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    /* backdrop */
    <div
      role="presentation"
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      {/* dialog */}
      <div
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        className="relative w-full max-w-xl bg-surface border border-outline-variant shadow-2xl overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* combobox input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant">
          <span className="material-symbols-outlined text-outline text-xl" aria-hidden="true">search</span>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={flatItems.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={flatItems[activeIndex] ? `cp-item-${flatItems[activeIndex].id}` : undefined}
            aria-autocomplete="list"
            aria-label="Search commands, markets and traces"
            className="flex-1 bg-transparent outline-none text-body-md text-on-surface placeholder:text-outline"
            placeholder="Search commands, markets, traces…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-surface-container border border-outline-variant text-outline-variant">
            Esc
          </kbd>
        </div>

        {/* results */}
        {flatItems.length > 0 ? (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Command results"
            className="max-h-80 overflow-y-auto py-2"
          >
            {[...grouped.entries()].map(([group, items]) => (
              <li key={group} role="presentation">
                <div
                  role="presentation"
                  className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-outline"
                >
                  {GROUP_LABELS[group]}
                </div>
                <ul role="presentation">
                  {items.map((item) => {
                    const itemIndex = flatItems.indexOf(item);
                    const isActive = itemIndex === activeIndex;
                    return (
                      <li
                        key={item.id}
                        id={`cp-item-${item.id}`}
                        role="option"
                        aria-selected={isActive}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-on-surface hover:bg-surface-container"
                        }`}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={() => {
                          void item.onSelect();
                          setOpen(false);
                        }}
                      >
                        {item.icon && (
                          <span
                            className="material-symbols-outlined text-[18px] shrink-0"
                            aria-hidden="true"
                          >
                            {item.icon}
                          </span>
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-body-md truncate">{item.label}</span>
                          {item.description && (
                            <span className="block text-[11px] text-outline truncate">
                              {item.description}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        ) : query ? (
          <p className="px-4 py-8 text-center text-on-surface-variant text-body-md">
            No results for &ldquo;{query}&rdquo;
          </p>
        ) : null}

        {/* footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-outline-variant text-[11px] text-outline">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
