import { describe, expect, it } from "vitest";
import { CATEGORY_TAGS, CATEGORY_TAGS_ARE_EXHAUSTIVE, marketCore } from "../clients";
import { BACKEND_CATEGORIES, BACKEND_TO_CONTRACT_CATEGORY } from "../categories";

describe("categories", () => {
  it("CATEGORY_TAGS lists exactly the contract's Category enum (read from the binding spec)", () => {
    expect(CATEGORY_TAGS_ARE_EXHAUSTIVE).toBe(true);
    const entry = marketCore().spec.findEntry("Category");
    const cases = entry.udtUnionV0().cases().map((c) => c.value().name().toString());
    expect([...CATEGORY_TAGS].sort()).toEqual([...cases].sort());
  });

  it("every backend category maps onto a contract category, same table as the backend", () => {
    expect(BACKEND_CATEGORIES.sort()).toEqual(
      ["CRYPTO", "ECB", "ELECTION", "ENTERTAINMENT", "FED", "GEOPOLITICAL", "MACRO", "POLITICS", "SPORTS"],
    );
    for (const c of BACKEND_CATEGORIES) {
      expect(CATEGORY_TAGS).toContain(BACKEND_TO_CONTRACT_CATEGORY[c]);
    }
    expect(BACKEND_TO_CONTRACT_CATEGORY.ENTERTAINMENT).toBe("Culture");
    expect(BACKEND_TO_CONTRACT_CATEGORY.FED).toBe("Macro");
  });
});
