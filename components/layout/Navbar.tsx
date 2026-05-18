"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/contexts/WalletContext";

export const Navbar = () => {
  const pathname = usePathname();
  const { isConnected, address, openModal, disconnect } = useWallet();

  const navLinks = [
    { 
      name: "Markets", 
      href: "/markets",
      dropdown: [
        // { name: "Market Overview", href: "/markets" },
        { name: "Live Terminal", href: "/markets/terminal" },
        { name: "Active Market Detail", href: "/market" },
      ]
    },
    { name: "Reasoning", href: "/reasoning" },
    { 
      name: "Portfolio", 
      href: "/portfolio",
      dropdown: [
        { name: "Active Positions", href: "/portfolio" },
        { name: "Analytics", href: "/portfolio/analytics" },
        { name: "Portfolio & Assets", href: "/portfolio/wallets" },
      ]
    },
    { name: "Stats", href: "/stats" },
    { name: "Admin", href: "/admin" },
  ];

  return (
    <header className="bg-surface border-b border-outline-variant sticky top-0 z-50 h-16">
      <div className="flex justify-between items-center w-full h-16 px-gutter max-w-container-max-width mx-auto">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-headline-md text-headline-md font-bold text-on-surface">
            OracleDesk
          </Link>
          <nav className="hidden md:flex items-center gap-6 h-full pt-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.dropdown && link.dropdown.some(d => pathname === d.href));
              
              if (link.dropdown) {
                return (
                  <div key={link.name} className="relative group flex items-center h-full">
                    <button
                      type="button"
                      className={`${
                        isActive
                          ? "text-primary border-b-2 border-primary pb-1 font-bold"
                          : "text-on-surface-variant font-medium hover:text-primary"
                      } transition-colors duration-200 cursor-pointer font-label-caps text-label-caps flex items-center gap-1 h-full`}
                      aria-haspopup="menu"
                    >
                      {link.name}
                      <span className="material-symbols-outlined text-[18px]">expand_more</span>
                    </button>
                    <div
                      role="menu"
                      className="absolute top-full left-0 mt-0 w-48 bg-white border border-outline-variant shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-all duration-200 py-2 z-50"
                    >
                      {link.dropdown.map((subItem) => (
                        <Link
                          key={subItem.name}
                          href={subItem.href}
                          role="menuitem"
                          className={`block px-4 py-2 hover:bg-surface-container text-body-md ${
                            pathname === subItem.href ? "text-primary font-bold" : "text-on-surface-variant"
                          }`}
                        >
                          {subItem.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`${
                    isActive
                      ? "text-primary border-b-2 border-primary pb-1 font-bold"
                      : "text-on-surface-variant font-medium hover:text-primary"
                  } transition-colors duration-200 cursor-pointer font-label-caps text-label-caps h-full flex items-center`}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link 
            href="/notifications"
            className={`material-symbols-outlined ${
              pathname === "/notifications" ? "text-primary" : "text-on-surface-variant"
            } hover:text-primary transition-colors cursor-pointer relative`}
          >
            notifications
            <span className="absolute top-0 right-0 w-2 h-2 bg-tertiary rounded-full border border-white"></span>
          </Link>
          {isConnected ? (
            <button 
              onClick={disconnect}
              className="bg-primary-container text-on-primary-container border border-primary px-4 py-2 font-data-mono text-[13px] rounded-lg hover:bg-primary-container/80 transition-all cursor-pointer"
            >
              {address}
            </button>
          ) : (
            <button 
              onClick={openModal}
              className="bg-primary text-primary-foreground px-4 py-2 font-label-caps text-label-caps rounded-lg hover:opacity-90 active:opacity-80 transition-all cursor-pointer"
            >
              Connect Wallet
            </button>
          )}
          <button className="material-symbols-outlined text-on-surface-variant cursor-pointer">
            expand_more
          </button>
        </div>
      </div>
    </header>
  );
};
