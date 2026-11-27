import enCatalog from "@/lib/i18n/messages/en.json";
import type { ErrorCode } from "./codes";
import { currentLocale, translateUnsafe } from "@/lib/i18n";

interface CatalogShape {
  errors: {
    kind: Record<string, string>;
    contract: Record<string, Record<string, string>>;
    api: Record<string, string>;
  };
}

/** English catalog: the source of the legacy interpolation fallback. */
const catalog: CatalogShape = enCatalog;

type Params = Record<string, string | number | undefined>;

/**
 * Formats `errors.<path>` through the ICU translator for the active locale.
 * Returns null when the message cannot be formatted (e.g. a required argument
 * was not supplied), so the caller can fall back to lenient interpolation.
 */
function translateError(path: string, params?: Params): string | null {
  try {
    return translateUnsafe(currentLocale(), `errors.${path}`, params) ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves a catalog error message for a given stable ErrorCode and interpolates
 * parameters. Messages are ICU MessageFormat (`{var}`, plural/select) resolved
 * for the active locale, falling back to English.
 */
export function messageFor(code: ErrorCode | string, params?: Params): string {
  const parts = code.split(".");
  const domain = parts[0];
  let path: string | undefined;
  let template: string | undefined;

  if (domain === "kind" && parts[1]) {
    path = `kind.${parts[1]}`;
    template = catalog.errors.kind[parts[1]];
  } else if (domain === "contract" && parts[1] && parts[2]) {
    const errorName = parts.slice(2).join(".");
    path = `contract.${parts[1]}.${errorName}`;
    template = catalog.errors.contract[parts[1]]?.[errorName];
    if (!template) {
      path = undefined;
      template = `The contract rejected this (${errorName}).`;
    }
  } else if (domain === "api" && parts[1]) {
    path = catalog.errors.api[parts[1]] ? `api.${parts[1]}` : "api.HTTP_UNKNOWN";
    template = catalog.errors.api[parts[1]] ?? catalog.errors.api.HTTP_UNKNOWN;
  }

  if (!template) {
    path = "kind.unknown";
    template = catalog.errors.kind.unknown;
  }

  return (path ? translateError(path, params) : null) ?? interpolate(template, params);
}

function interpolate(
  template: string,
  params?: Record<string, string | number | undefined>,
): string {
  // First, resolve plural blocks: {param, plural, one {pattern1} other {pattern2}}
  const pluralRegex = /\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\}/g;
  let text = template.replace(pluralRegex, (_match, varName, onePattern, otherPattern) => {
    const val = params?.[varName];
    if (val === undefined || val === null) {
      return "a moment";
    }
    const num = Number(val);
    const pattern = num === 1 ? onePattern : otherPattern;
    return pattern.replace(/#/g, String(num));
  });

  // Next, simple {var} replacements
  const varRegex = /\{(\w+)\}/g;
  text = text.replace(varRegex, (match, varName) => {
    const val = params?.[varName];
    return val !== undefined && val !== null ? String(val) : match;
  });

  return text;
}
