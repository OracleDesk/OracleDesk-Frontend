import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isActive, activeHref } from "../nav-items";

describe("nav-items", () => {
  const marketsItem = NAV_ITEMS.find((item) => item.label === "Markets")!;
  const portfolioItem = NAV_ITEMS.find((item) => item.label === "Portfolio")!;
  const reasoningItem = NAV_ITEMS.find((item) => item.label === "Reasoning")!;

  describe("isActive", () => {
    it("returns false for root / path", () => {
      expect(isActive(marketsItem, "/")).toBe(false);
      expect(isActive(portfolioItem, "/")).toBe(false);
      expect(isActive(reasoningItem, "/")).toBe(false);
    });

    it("returns true for exact section parent /markets", () => {
      expect(isActive(marketsItem, "/markets")).toBe(true);
      expect(isActive(portfolioItem, "/markets")).toBe(false);
    });

    it("returns true for child route /markets/terminal", () => {
      expect(isActive(marketsItem, "/markets/terminal")).toBe(true);
      expect(isActive(portfolioItem, "/markets/terminal")).toBe(false);
    });

    it("returns true for /portfolio", () => {
      expect(isActive(portfolioItem, "/portfolio")).toBe(true);
      expect(isActive(marketsItem, "/portfolio")).toBe(false);
    });

    it("returns true for child route /portfolio/analytics", () => {
      expect(isActive(portfolioItem, "/portfolio/analytics")).toBe(true);
      expect(isActive(marketsItem, "/portfolio/analytics")).toBe(false);
    });

    it("returns false for unknown paths", () => {
      expect(isActive(marketsItem, "/unknown")).toBe(false);
      expect(isActive(portfolioItem, "/unknown")).toBe(false);
      expect(isActive(reasoningItem, "/unknown")).toBe(false);
    });
  });

  describe("activeHref", () => {
    it("returns null for root / path", () => {
      expect(activeHref("/")).toBeNull();
    });

    it("returns /markets for /markets path", () => {
      expect(activeHref("/markets")).toBe("/markets");
    });

    it("returns /markets/terminal for /markets/terminal path", () => {
      expect(activeHref("/markets/terminal")).toBe("/markets/terminal");
    });

    it("returns /portfolio for /portfolio path (exact child match)", () => {
      expect(activeHref("/portfolio")).toBe("/portfolio");
    });

    it("returns /portfolio/analytics for /portfolio/analytics path", () => {
      expect(activeHref("/portfolio/analytics")).toBe("/portfolio/analytics");
    });

    it("returns null for unknown paths", () => {
      expect(activeHref("/unknown")).toBeNull();
      expect(activeHref("/random-path")).toBeNull();
    });

    it("returns exact leaf route instead of section parent", () => {
      // /portfolio/wallets matches child, not parent
      expect(activeHref("/portfolio/wallets")).toBe("/portfolio/wallets");
    });
  });
});
