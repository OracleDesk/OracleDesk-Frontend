import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import Navbar from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WalletProvider } from "@/lib/contexts/WalletContext";
import "./globals.css";
import { RealtimeProvider } from "@/lib/realtime/RealtimeProvider";
import { HealthProvider } from "@/lib/health/HealthProvider";
import { InboxProvider } from "@/lib/notifications/InboxProvider";
import { PwaRegistrar } from "@/components/pwa/pwa-registrar";
import { DebugMount } from "@/components/debug/debug-mount";
import { RpcDegradedBanner } from "@/components/debug/RpcPanel";
import { NetworkConsistencyBanner } from "@/components/layout/NetworkConsistencyBanner";
import { IntegrityBanner } from "@/components/layout/IntegrityBanner";
import { BuildIdentityBanner } from "@/components/layout/BuildIdentityBanner";
import { CopyTradeReconciler } from "@/components/copy-trade/CopyTradeReconciler";
import { ViewedAddressProvider } from "@/lib/hooks/useViewedAddress";
import { ViewingBanner } from "@/components/layout/ViewingBanner";
import { WebVitals } from "@/app/web-vitals";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ConsentBanner } from "@/components/consent-banner";
import { ErrorReportingInit } from "@/components/observability/ErrorReportingInit";
import { DirectionProvider } from "@/components/layout/DirectionProvider";
import { dirForLocale, type Dir } from "@/lib/i18n/direction";
import { I18nProvider } from "@/lib/i18n/provider";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OracleDesk | Institutional-Grade AI Prediction Terminal",
  description: "The world's most accurate AI-driven prediction terminal.",
  applicationName: "OracleDesk",
  appleWebApp: { capable: true, title: "OracleDesk", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#004655",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const forcedDir = process.env.NEXT_PUBLIC_FORCE_DIR;
  const dir: Dir = forcedDir === "rtl" || forcedDir === "ltr" ? forcedDir : dirForLocale("en");
  return (
    <html
      lang="en"
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body-md text-on-surface">
        <DirectionProvider dir={dir}>
        <I18nProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-foreground font-label-caps"
        >
          Skip to main content
        </a>
        <BuildIdentityBanner />
        <PwaRegistrar>
          <WalletProvider>
            <ViewedAddressProvider>
            <CopyTradeReconciler />
            <ErrorReportingInit />
            <ConsentBanner />
            <RealtimeProvider>
              <HealthProvider>
                <InboxProvider>
                  <Navbar />
                  <div className="sticky top-0 z-50 flex flex-col">
                    <IntegrityBanner />
                    <ViewingBanner />
                  </div>
                  <NetworkConsistencyBanner />
                  <RpcDegradedBanner />
                  <div id="main-content" tabIndex={-1} className="flex-1 flex flex-col outline-none">
                    {children}
                  </div>
                  <Footer />
                  <DebugMount />
                  <CommandPalette />
                  <WebVitals />
                </InboxProvider>
              </HealthProvider>
            </RealtimeProvider>
          </ViewedAddressProvider>
        </WalletProvider>
        </PwaRegistrar>
        </I18nProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
