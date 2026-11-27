import { IntlMessageFormat } from "intl-messageformat";
import en from "./messages/en.json";
import type { MessageParamTypes } from "./message-params.generated";

/**
 * Locales the app can render. `en-XA` is a generated pseudo-locale (accented,
 * ~30% longer) for catching truncation and untranslated strings; it is never
 * picked automatically.
 */
export const SUPPORTED_LOCALES = ["en", "en-XA"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** Cookie holding an explicit locale choice (same name next-intl uses). */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const PSEUDO_LOCALE: Locale = "en-XA";

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export type Messages = typeof en;

type Flatten<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Flatten<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every message key in `en.json`, e.g. "nav.home". An unknown key fails typecheck. */
export type MessageKey = Flatten<Messages>;

type ParamsFor<K extends MessageKey> = K extends keyof MessageParamTypes
  ? MessageParamTypes[K] extends undefined
    ? [params?: undefined]
    : [params: MessageParamTypes[K]]
  : [params?: Record<string, never>];

export type Translator = <K extends MessageKey>(key: K, ...args: ParamsFor<K>) => string;

type FlatParams = Record<string, string | number | boolean | Date | null | undefined>;

const registry = new Map<Locale, Messages>([["en", en]]);

/** Makes a catalog available to the synchronous translators. */
export function registerMessages(locale: Locale, messages: Messages): void {
  registry.set(locale, messages);
}

/** Loads (code-split) the catalog for a locale; only the active one is fetched. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const cached = registry.get(locale);
  if (cached) return cached;
  const loaded = (await import(`./messages/${locale}.json`)) as { default: Messages };
  registry.set(locale, loaded.default);
  return loaded.default;
}

function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

const formatCache = new Map<string, IntlMessageFormat>();

function formatMessage(locale: Locale, key: string, template: string, params: FlatParams | undefined): string {
  const cacheKey = `${locale}\u0000${key}`;
  let format = formatCache.get(cacheKey);
  if (!format) {
    format = new IntlMessageFormat(template, locale);
    formatCache.set(cacheKey, format);
  }
  const result = format.format(params as Record<string, string | number | boolean | Date | null | undefined>);
  return Array.isArray(result) ? result.join("") : String(result);
}

/**
 * Looks up and formats a message by an untyped key. Falls back to the English
 * catalog, then returns `undefined`. For dynamic keys (error codes); static
 * callers should use the typed translator.
 */
export function translateUnsafe(locale: Locale, key: string, params?: FlatParams): string | undefined {
  const own = lookup(registry.get(locale), key);
  if (own !== undefined) return formatMessage(locale, key, own, params);
  const fallback = lookup(registry.get(DEFAULT_LOCALE), key);
  return fallback === undefined ? undefined : formatMessage(DEFAULT_LOCALE, key, fallback, params);
}

/**
 * A translator bound to a locale for code that is not a React component
 * (error mapping, wallet provider). Missing keys throw under test and return
 * the key itself in production, so a gap is visible instead of blank.
 */
export function createServerlessTranslator(locale: Locale): Translator {
  return ((key: string, params?: FlatParams) => {
    const text = translateUnsafe(locale, key, params);
    if (text === undefined) {
      if (process.env.NODE_ENV === "test") throw new Error(`Missing i18n message: ${key}`);
      return key;
    }
    return text;
  }) as Translator;
}

let activeLocale: Locale = DEFAULT_LOCALE;

/** Set by the locale provider; read by non-React code. Defaults to `en`. */
export function setCurrentLocale(locale: Locale): void {
  activeLocale = locale;
}

export function currentLocale(): Locale {
  return activeLocale;
}

export interface NegotiationInput {
  /** Value of the `NEXT_LOCALE` cookie: an explicit, persisted choice. */
  cookie?: string | null;
  /** `Accept-Language` header value. */
  acceptLanguage?: string | null;
  /** `navigator.languages`. */
  languages?: readonly string[] | null;
}

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([0-9.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q), index };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((entry) => entry.tag);
}

/** The supported (non-pseudo) locale matching a language tag exactly or by language, else null. */
function matchTag(tag: string): Locale | null {
  const lower = tag.toLowerCase();
  const exact = SUPPORTED_LOCALES.find((l) => l !== PSEUDO_LOCALE && l.toLowerCase() === lower);
  if (exact) return exact;
  const language = lower.split("-")[0];
  return SUPPORTED_LOCALES.find((l) => l !== PSEUDO_LOCALE && l.toLowerCase().split("-")[0] === language) ?? null;
}

/**
 * Explicit choice (cookie) wins, then the browser's preference, then `en`.
 * The pseudo-locale is only ever returned from an explicit cookie.
 */
export function negotiateLocale(input: NegotiationInput = {}): Locale {
  if (input.cookie && isLocale(input.cookie)) return input.cookie;
  const tags = input.languages?.length ? [...input.languages] : input.acceptLanguage ? parseAcceptLanguage(input.acceptLanguage) : [];
  for (const tag of tags) {
    const match = matchTag(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
