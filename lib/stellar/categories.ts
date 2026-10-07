import type { MarketCategory } from "@/lib/api/markets";
import type { CategoryTag } from "./clients";

/**
 * The backend's display categories mapped onto the contract's Category,
 * the same table as the backend's toContractCategory() (docs/api.md).
 * Typed as a Record over every backend category, so adding one without a
 * mapping is a compile error.
 */
export const BACKEND_TO_CONTRACT_CATEGORY: Record<MarketCategory, CategoryTag> = {
  FED: "Macro",
  ECB: "Macro",
  MACRO: "Macro",
  GEOPOLITICAL: "Geopolitics",
  ELECTION: "Geopolitics",
  POLITICS: "Geopolitics",
  CRYPTO: "Crypto",
  SPORTS: "Sports",
  ENTERTAINMENT: "Culture",
};

export const BACKEND_CATEGORIES = Object.keys(BACKEND_TO_CONTRACT_CATEGORY) as MarketCategory[];

export const BACKEND_CATEGORY_LABELS: Record<MarketCategory, string> = {
  FED: "Fed",
  ECB: "ECB",
  MACRO: "Macro",
  GEOPOLITICAL: "Geopolitical",
  ELECTION: "Election",
  POLITICS: "Politics",
  CRYPTO: "Crypto",
  SPORTS: "Sports",
  ENTERTAINMENT: "Entertainment",
};
