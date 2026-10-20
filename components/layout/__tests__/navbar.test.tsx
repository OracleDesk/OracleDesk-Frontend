import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Navbar from "../Navbar";
import { NAV_ITEMS, isActive, activeHref } from "../nav-items";

vi.mock("next/navigation", () => ({
  usePathname: () => "/markets",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/notifications/InboxProvider", () => ({
  useInbox: () => ({ unread: 2, items: [] }),
}));

vi.mock("../HealthIndicator", () => ({
  HealthIndicator: () => <div data-testid="health-indicator" />,
}));

vi.mock("@/lib/contexts/WalletContext", () => ({
  useWalletAddress: () => ({ address: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7", isConnected: true }),
  useWalletNetwork: () => ({ isWrongNetwork: false }),
  useWalletSession: () => ({ isConnecting: false, error: null }),
  useWalletActions: () => ({ openModal: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock("@/lib/hooks/useStellar", () => ({
  useAccountReserve: () => ({ data: { funded: true, balance: 100000000n, spendable: 90000000n }, isLoading: false }),
  useEnableUsdc: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRpcNetwork: () => ({ data: { friendbotUrl: "https://friendbot.stellar.org" } }),
  useUsdcBalance: () => ({ data: 500000000n }),
  useUsdcTrustline: () => ({ data: { kind: "present", authorized: true } }),
  useUsdcBalanceState: () => ({ data: undefined }),
}));

describe("Navbar & Navigation", () => {
  it("renders brand logo and nav items", () => {
    render(<Navbar />);
    expect(screen.getByText("OracleDesk")).toBeDefined();
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Markets/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Portfolio/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Reasoning/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Stats/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Admin/i })).toBeDefined();
  });

  it("has accessible notifications button with label", () => {
    render(<Navbar />);
    const notificationsLink = screen.getByRole("link", { name: "Notifications" });
    expect(notificationsLink).toBeDefined();
  });

  it("opens mobile navigation drawer on hamburger click", async () => {
    render(<Navbar />);
    const hamburger = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(hamburger);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Site navigation" })).toBeDefined();
    });
  });
});
