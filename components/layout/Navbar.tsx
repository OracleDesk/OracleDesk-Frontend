"use client";
import { Icon } from "@/components/ui/icon";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu as NM } from "radix-ui";
import { useInbox } from "@/lib/notifications/InboxProvider";
import WalletDropdown from "./WalletDropdown";
import { HealthIndicator } from "./HealthIndicator";
import { MobileNav } from "./MobileNav";
import { NAV_ITEMS, isActive, activeHref } from "./nav-items";

const Navbar = () => {
  const pathname = usePathname();
  const { unread } = useInbox();
  const currentHref = activeHref(pathname);

  return (
    <header className="bg-surface border-b border-outline-variant sticky top-0 z-50 h-16">
      <div className="flex justify-between items-center w-full h-16 px-gutter max-w-container-max-width mx-auto">
        <div className="flex items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-2">
            <MobileNav />
            <Link
              href="/"
              className="font-headline-md text-headline-md font-bold text-on-surface focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-sm"
            >
              OracleDesk
            </Link>
          </div>

          <NM.Root delayDuration={150} skipDelayDuration={300} className="relative z-20 hidden md:flex items-center h-full">
            <NM.List className="flex items-center gap-6 h-full pt-1 list-none m-0 p-0">
              {NAV_ITEMS.map((item) => {
                const itemIsActive = isActive(item, pathname);

                if (item.children) {
                  return (
                    <NM.Item key={item.label} className="relative flex items-center h-full">
                      <NM.Trigger
                        className={`${
                          itemIsActive
                            ? "text-primary border-b-2 border-primary pb-1 font-bold"
                            : "text-on-surface-variant font-medium hover:text-primary"
                        } transition-colors duration-200 cursor-pointer font-label-caps text-label-caps flex items-center gap-1 h-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-sm bg-transparent border-0`}
                      >
                        {item.label}
                        <Icon name="expand_more" className="text-[18px] transition-transform duration-200 group-data-[state=open]:rotate-180" />
                      </NM.Trigger>
                      <NM.Content className="absolute top-full left-0 mt-0 w-48 bg-white border border-outline-variant shadow-lg py-2 rounded-md z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none">
                        <ul className="flex flex-col list-none m-0 p-0">
                          {item.children.map((subItem) => {
                            const isExact = currentHref === subItem.href;
                            return (
                              <li key={subItem.href}>
                                <NM.Link asChild>
                                  <Link
                                    href={subItem.href}
                                    aria-current={isExact ? "page" : undefined}
                                    className={`block px-4 py-2 hover:bg-surface-container text-body-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-sm ${
                                      pathname === subItem.href ? "text-primary font-bold" : "text-on-surface-variant"
                                    }`}
                                  >
                                    {subItem.label}
                                  </Link>
                                </NM.Link>
                              </li>
                            );
                          })}
                        </ul>
                      </NM.Content>
                    </NM.Item>
                  );
                }

                const isExact = currentHref === item.href;
                return (
                  <NM.Item key={item.label} className="flex items-center h-full">
                    <NM.Link asChild>
                      <Link
                        href={item.href}
                        aria-current={isExact ? "page" : undefined}
                        className={`${
                          itemIsActive
                            ? "text-primary border-b-2 border-primary pb-1 font-bold"
                            : "text-on-surface-variant font-medium hover:text-primary"
                        } transition-colors duration-200 cursor-pointer font-label-caps text-label-caps h-full flex items-center focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-sm`}
                      >
                        {item.label}
                      </Link>
                    </NM.Link>
                  </NM.Item>
                );
              })}
            </NM.List>
          </NM.Root>
        </div>

        <div className="flex items-center gap-4">
          <HealthIndicator />
          <Link
            aria-label="Notifications"
            className={`${
              pathname === "/notifications" ? "text-primary" : "text-on-surface-variant"
            } hover:text-primary transition-colors cursor-pointer relative p-1 rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none`}
            href="/notifications"
          >
            <span aria-hidden="true" className="flex items-center">
              <Icon name="notifications" />
            </span>
            {unread > 0 && (
              <span aria-hidden="true" className="absolute top-0 right-0 w-2 h-2 bg-tertiary rounded-full" />
            )}
          </Link>
          
          <WalletDropdown />
        </div>
      </div>
    </header>
  );
};

export default Navbar;
