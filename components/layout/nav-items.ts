import type { Route } from "next";
import type { MessageKey } from "@/lib/i18n";
import { routes } from "@/lib/routes";

export interface NavItem {
  /** English label; surfaces outside the migrated navbar (command palette, mobile nav) still read it. */
  label: string;
  /** Catalog key the navbar renders through `t()`. */
  labelKey: MessageKey;
  href: Route;
  children?: { label: string; labelKey: MessageKey; href: Route }[];
  /** Permission required to view this item in navigation (RBAC) */
  permission?: "admin.read";
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Markets", labelKey: "nav.markets",
    href: routes.markets(),
    children: [
      { label: "Live Terminal", labelKey: "nav.liveTerminal", href: routes.marketsTerminal() },
      { label: "Active Market Detail", labelKey: "nav.activeMarketDetail", href: routes.market() },
      { label: "FPMM Explainer", labelKey: "nav.fpmmExplainer", href: routes.learnFpmm() },
      { label: "Glossary", labelKey: "nav.glossary", href: routes.glossary() },
    ],
  },
  {
    label: "Reasoning", labelKey: "nav.reasoning",
    href: routes.reasoning(),
  },
  {
    label: "Portfolio", labelKey: "nav.portfolio",
    href: routes.portfolio(),
    children: [
      { label: "Active Positions", labelKey: "nav.activePositions", href: routes.portfolio() },
      { label: "Analytics", labelKey: "nav.analytics", href: routes.portfolioAnalytics() },
      { label: "Portfolio & Assets", labelKey: "nav.portfolioAssets", href: routes.portfolioWallets() },
    ],
  },
  {
    label: "Stats", labelKey: "nav.stats",
    href: routes.stats(),
  },
  {
    label: "Admin", labelKey: "nav.admin",
    href: routes.admin(),
    permission: "admin.read",
  },
] as const;

/**
 * Returns whether an item or one of its children matches the current pathname.
 * Retains section parent active highlighting.
 */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === pathname) return true;
  if (item.children) {
    return item.children.some((child) => child.href === pathname);
  }
  return false;
}

/**
 * Returns the single exact href that should carry aria-current="page".
 * Exact child match wins over parent section match.
 */
export function activeHref(pathname: string): string | null {
  // Exact match on child items wins first
  for (const item of NAV_ITEMS) {
    if (item.children) {
      for (const child of item.children) {
        if (child.href === pathname) {
          return child.href;
        }
      }
    }
  }
  // Then exact match on top-level items
  for (const item of NAV_ITEMS) {
    if (item.href === pathname) {
      return item.href;
    }
  }
  return null;
}
