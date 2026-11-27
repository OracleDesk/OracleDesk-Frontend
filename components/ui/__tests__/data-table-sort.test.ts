import { describe, expect, it } from "vitest";
import { compareSortValues, mergePrepend, newRowsSince, planAnnouncement, sortRows } from "../data-table-utils";

describe("compareSortValues", () => {
  it("orders bigint beyond 2^53 correctly", () => {
    const a = 9_007_199_254_740_993n; // 2^53 + 1
    const b = 9_007_199_254_740_992n; // 2^53
    expect(Number(a) === Number(b)).toBe(true); // a float cannot tell them apart
    expect(compareSortValues(a, b)).toBe(1);
    expect(compareSortValues(b, a)).toBe(-1);
    expect(compareSortValues(a, a)).toBe(0);
  });

  it("compares bigint with number exactly", () => {
    expect(compareSortValues(9_007_199_254_740_993n, 9_007_199_254_740_992)).toBe(1);
    expect(compareSortValues(1n, 2)).toBe(-1);
  });

  it("uses numeric collation for strings", () => {
    expect(compareSortValues("10", "9")).toBe(1);
    expect(compareSortValues("item 2", "item 10")).toBe(-1);
  });

  it("compares dates by time", () => {
    expect(compareSortValues(new Date(1000), new Date(2000))).toBe(-1);
    expect(compareSortValues(new Date(2000), new Date(2000))).toBe(0);
  });

  it("sorts null last", () => {
    expect(compareSortValues(null, 1n)).toBe(1);
    expect(compareSortValues(1n, null)).toBe(-1);
    expect(compareSortValues(null, null)).toBe(0);
  });
});

describe("sortRows", () => {
  const rows = [
    { id: "a", amount: 2n },
    { id: "b", amount: null },
    { id: "c", amount: 1n },
    { id: "d", amount: 2n },
    { id: "e", amount: 10n ** 20n },
  ];

  it("keeps nulls last in both directions", () => {
    expect(sortRows(rows, (r) => r.amount, "ascending").map((r) => r.id)).toEqual(["c", "a", "d", "e", "b"]);
    expect(sortRows(rows, (r) => r.amount, "descending").map((r) => r.id)).toEqual(["e", "a", "d", "c", "b"]);
  });

  it("is stable for equal keys in both directions", () => {
    expect(sortRows(rows, (r) => r.amount, "ascending").filter((r) => r.amount === 2n).map((r) => r.id)).toEqual(["a", "d"]);
    expect(sortRows(rows, (r) => r.amount, "descending").filter((r) => r.amount === 2n).map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("does not mutate its input", () => {
    const copy = [...rows];
    sortRows(rows, (r) => r.amount, "ascending");
    expect(rows).toEqual(copy);
  });
});

describe("live merging", () => {
  const id = (r: { id: string }) => r.id;

  it("keeps newest-first order of equal keys when inserting", () => {
    const existing = [
      { id: "2", size: 5n },
      { id: "1", size: 5n },
    ];
    const merged = mergePrepend(existing, [{ id: "3", size: 5n }], id, 10);
    expect(sortRows(merged, (r) => r.size, "ascending").map(id)).toEqual(["3", "2", "1"]);
    expect(sortRows(merged, (r) => r.size, "descending").map(id)).toEqual(["3", "2", "1"]);
  });

  it("dedupes replayed ids and caps the length", () => {
    const merged = mergePrepend([{ id: "1" }, { id: "2" }], [{ id: "2" }, { id: "3" }, { id: "3" }], id, 3);
    expect(merged.map(id)).toEqual(["2", "3", "1"]);
  });

  it("finds rows not seen before", () => {
    expect(newRowsSince([{ id: "1" }, { id: "2" }], new Set(["1"]), id).map(id)).toEqual(["2"]);
  });
});

describe("planAnnouncement", () => {
  it("announces immediately the first time and after the interval", () => {
    expect(planAnnouncement(1000, null, 1)).toEqual({ kind: "now", count: 1 });
    expect(planAnnouncement(6000, 1000, 3)).toEqual({ kind: "now", count: 3 });
  });

  it("defers within the interval and reports the wait", () => {
    expect(planAnnouncement(3000, 1000, 2)).toEqual({ kind: "later", delayMs: 3000 });
  });

  it("does nothing with nothing queued", () => {
    expect(planAnnouncement(0, null, 0)).toEqual({ kind: "none" });
  });
});
