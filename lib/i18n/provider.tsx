"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  PSEUDO_LOCALE,
  createServerlessTranslator,
  isLocale,
  loadMessages,
  negotiateLocale,
  setCurrentLocale,
  type Locale,
  type Translator,
} from "./index";

interface I18nValue {
  locale: Locale;
  t: Translator;
}

const defaultValue: I18nValue = { locale: DEFAULT_LOCALE, t: createServerlessTranslator(DEFAULT_LOCALE) };
const I18nContext = createContext<I18nValue>(defaultValue);

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

/** Persist an explicit locale choice (read back by `negotiateLocale`). */
export function setLocalePreference(locale: Locale): void {
  try {
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Cookies blocked: the choice just does not persist.
  }
}

/** Locale to start from on the client: explicit cookie, dev-only `?lang=en-XA`, browser languages, then `en`. */
export function detectClientLocale(): Locale {
  let cookie = readCookie(LOCALE_COOKIE);
  if (process.env.NODE_ENV !== "production") {
    const lang = new URLSearchParams(window.location.search).get("lang");
    if (lang && isLocale(lang)) cookie = lang;
  }
  return negotiateLocale({ cookie, languages: navigator.languages });
}

/**
 * Provides the active locale and typed `t()` to client components.
 * Renders `en` during prerender and hydration (so markup always matches),
 * then switches to the negotiated locale on mount. Pass `locale` to force one.
 */
export function I18nProvider({ locale: forced, children }: { locale?: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(forced ?? DEFAULT_LOCALE);
  const [ready, setReady] = useState(forced === undefined || forced === DEFAULT_LOCALE);

  useEffect(() => {
    let cancelled = false;
    const target = forced ?? detectClientLocale();
    if (target === DEFAULT_LOCALE) {
      setCurrentLocale(DEFAULT_LOCALE);
      return;
    }
    void loadMessages(target).then(() => {
      if (cancelled) return;
      setCurrentLocale(target);
      setLocale(target);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [forced]);

  const effective = ready ? locale : DEFAULT_LOCALE;
  const value = useMemo<I18nValue>(() => ({ locale: effective, t: createServerlessTranslator(effective) }), [effective]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Typed translator for the active locale. Works without a provider (English). */
export function useTranslations(): Translator {
  return useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

/** Switch the active locale at runtime and remember it. */
export function useSetLocale(): (locale: Locale) => Promise<void> {
  return useCallback(async (locale: Locale) => {
    if (locale === PSEUDO_LOCALE && process.env.NODE_ENV === "production") return;
    await loadMessages(locale);
    setLocalePreference(locale);
    window.location.reload();
  }, []);
}
