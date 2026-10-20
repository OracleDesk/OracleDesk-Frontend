export interface NavItem {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Markets",
    href: "/markets",
    children: [
      { label: "Live Terminal", href: "/markets/terminal" },
      { label: "Active Market Detail", href: "/market" },
    ],
  },
  {
    label: "Reasoning",
    href: "/reasoning",
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    children: [
      { label: "Active Positions", href: "/portfolio" },
      { label: "Analytics", href: "/portfolio/analytics" },
      { label: "Portfolio & Assets", href: "/portfolio/wallets" },
    ],
  },
  {
    label: "Stats",
    href: "/stats",
  },
  {
    label: "Admin",
    href: "/admin",
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
