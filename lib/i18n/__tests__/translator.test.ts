import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, createServerlessTranslator, currentLocale, isLocale, loadMessages, negotiateLocale, registerMessages, setCurrentLocale, translateUnsafe } from "../index";
import { messageFor } from "../../errors/messages";
import en from "../messages/en.json";

describe("translator", () => {
  const t = createServerlessTranslator("en");

  it("formats arguments and select", () => {
    expect(t("wallet.verifying", { percent: 42 })).toBe("Verifying your browser… 42%");
    expect(t("wallet.networkUnknownDetail", { confirmed: "true" })).toBe("Network: unknown (confirmed)");
    expect(t("wallet.networkUnknownDetail", { confirmed: "false" })).toBe("Network: unknown — confirm before signing");
    expect(t("wallet.switchNetwork", { network: "Stellar Testnet" })).toBe("Your wallet is on a different network. Switch it to Stellar Testnet.");
  });

  it("renders plurals", () => {
    registerMessages("en", { ...en, ...{ errors: { ...en.errors } } });
    expect(translateUnsafe("en", "errors.api.RATE_LIMITED", { seconds: 1 })).toBe("Too many requests. Try again in 1 second.");
    expect(translateUnsafe("en", "errors.api.RATE_LIMITED", { seconds: 5 })).toBe("Too many requests. Try again in 5 seconds.");
  });

  it("throws on a missing key in the test environment", () => {
    // @ts-expect-error unknown keys fail typecheck
    expect(() => t("does.not.exist")).toThrow("Missing i18n message: does.not.exist");
  });

  it("fails typecheck for missing or wrong params", () => {
    // Compile-time only: the closure is never called, `tsc` checks the directives.
    const typeChecks = () => {
      // @ts-expect-error `percent` is required
      t("wallet.verifying");
      // @ts-expect-error `network` is required
      t("wallet.switchNetwork", {});
      // @ts-expect-error messages without arguments take none
      t("wallet.connect", { extra: 1 });
      // @ts-expect-error `percent` must be a string or number
      t("wallet.verifying", { percent: {} });
      t("wallet.verifying", { percent: 1 });
    };
    expect(typeof typeChecks).toBe("function");
  });

  it("keeps English identical for existing error messages", () => {
    expect(messageFor("kind.rejected")).toBe("You cancelled the request in your wallet.");
    expect(messageFor("kind.insufficient-balance")).toBe("You don't have enough USDC for this.");
    expect(messageFor("kind.wrong-network", { network: "Stellar Testnet" })).toBe("Switch your wallet to Stellar Testnet and try again.");
    expect(messageFor("kind.wrong-network")).toBe("Switch your wallet to {network} and try again.");
    expect(messageFor("api.RATE_LIMITED", { seconds: 1 })).toBe("Too many requests. Try again in 1 second.");
    expect(messageFor("api.RATE_LIMITED")).toBe("Too many requests. Try again in a moment.");
    expect(messageFor("contract.marketCore.NoSuchThing")).toBe("The contract rejected this (NoSuchThing).");
  });
});

describe("locales", () => {
  it("lists the supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "en-XA"]);
    expect(isLocale("en-XA")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("serves the pseudo-locale through the same translator and falls back to English", async () => {
    await loadMessages("en-XA");
    const pseudo = createServerlessTranslator("en-XA");
    expect(pseudo("wallet.connect")).toMatch(/^\[Çöññéçţ/);
    expect(pseudo("wallet.verifying", { percent: 7 })).toContain("7%");
    setCurrentLocale("en-XA");
    expect(messageFor("kind.rejected")).toMatch(/^\[/);
    setCurrentLocale(DEFAULT_LOCALE);
    expect(currentLocale()).toBe("en");
  });
});

describe("negotiateLocale", () => {
  it("prefers an explicit cookie, then browser languages, then en", () => {
    expect(negotiateLocale({ cookie: "en-XA", languages: ["en-US"] })).toBe("en-XA");
    expect(negotiateLocale({ cookie: "xx", languages: ["en-GB"] })).toBe("en");
    expect(negotiateLocale({ languages: ["de-DE", "en-US"] })).toBe("en");
    expect(negotiateLocale({ acceptLanguage: "de;q=0.9, en-US;q=0.8" })).toBe("en");
    expect(negotiateLocale({ acceptLanguage: "fr-CH, fr;q=0.9" })).toBe("en");
    expect(negotiateLocale({})).toBe("en");
  });

  it("never picks the pseudo-locale automatically", () => {
    expect(negotiateLocale({ languages: ["en-XA"] })).toBe("en");
    expect(negotiateLocale({ acceptLanguage: "en-XA" })).toBe("en");
  });
});
