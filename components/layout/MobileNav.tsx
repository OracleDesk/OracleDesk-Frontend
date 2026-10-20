"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { Icon } from "@/components/ui/icon";
import { NAV_ITEMS, isActive, activeHref } from "./nav-items";
import { useWalletSession } from "@/lib/contexts/WalletContext";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { isConnecting } = useWalletSession();

  // Expanded state for nested sections (default expanded for quick navigation)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Markets: true,
    Portfolio: true,
  });

  // Close when pathname changes (route navigation)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // If wallet kit modal opens, close mobile drawer to avoid fighting focus traps
  const [prevConnecting, setPrevConnecting] = useState(isConnecting);
  if (prevConnecting !== isConnecting) {
    setPrevConnecting(isConnecting);
    if (isConnecting) {
      setOpen(false);
    }
  }

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const currentHref = activeHref(pathname);

  return (
    <div className="md:hidden">
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Trigger asChild>
          <button
            type="button"
            aria-label="Open navigation menu"
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            <Icon name="menu" className="text-2xl" />
          </button>
        </D.Trigger>

        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-on-background/20 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
          <D.Content
            aria-label="Site navigation"
            aria-labelledby={undefined}
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 h-full w-72 max-w-[85vw] bg-surface border-r border-outline-variant shadow-2xl p-6 flex flex-col justify-between overflow-y-auto focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-300 motion-reduce:animate-none"
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-outline-variant">
                <D.Title className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  OracleDesk
                </D.Title>
                <D.Close asChild>
                  <button
                    type="button"
                    aria-label="Close navigation menu"
                    className="p-2 text-on-surface-variant hover:text-on-surface rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                  >
                    <Icon name="close" />
                  </button>
                </D.Close>
              </div>

              <nav className="mt-6 space-y-2">
                {NAV_ITEMS.map((item) => {
                  if (item.children) {
                    const isExpanded = expandedSections[item.label] ?? true;
                    return (
                      <div key={item.label} className="space-y-1">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleSection(item.label)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-label-caps text-label-caps font-bold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                            isActive(item, pathname)
                              ? "text-primary bg-primary-container/10"
                              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                          }`}
                        >
                          <span>{item.label}</span>
                          <Icon
                            name="expand_more"
                            className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                        {isExpanded && (
                          <div className="pl-4 space-y-1 border-l-2 border-outline-variant ml-3">
                            {item.children.map((child) => {
                              const isExact = currentHref === child.href;
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={() => setOpen(false)}
                                  aria-current={isExact ? "page" : undefined}
                                  className={`block px-3 py-2 rounded-lg text-body-md transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                                    isExact
                                      ? "text-primary font-bold bg-primary-container/10"
                                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                                  }`}
                                >
                                  {child.label}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const isExact = currentHref === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isExact ? "page" : undefined}
                      className={`block px-3 py-2.5 rounded-lg font-label-caps text-label-caps font-bold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                        isExact
                          ? "text-primary bg-primary-container/10"
                          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="pt-6 border-t border-outline-variant text-xs font-data-mono text-outline">
              STELLAR TESTNET
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </div>
  );
}
