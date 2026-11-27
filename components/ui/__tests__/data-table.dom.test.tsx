import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable, type ColumnDef } from "../data-table";

interface Trade {
  id: string;
  market: string;
  size: bigint;
}

const columns: ColumnDef<Trade>[] = [
  { id: "market", header: "Market", isRowHeader: true, cell: (r) => r.market, sortValue: (r) => r.market },
  { id: "size", header: "Size", numeric: true, cell: (r) => `${r.size} USDC`, sortValue: (r) => r.size },
  { id: "note", header: "Note", cell: () => "-", hideOnMobile: true },
];

const rows: Trade[] = [
  { id: "1", market: "Alpha", size: 9_007_199_254_740_993n },
  { id: "2", market: "Beta", size: 9_007_199_254_740_992n },
  { id: "3", market: "Gamma", size: 5n },
];

const renderTable = (extra: Partial<React.ComponentProps<typeof DataTable<Trade>>> = {}) =>
  render(<DataTable<Trade> caption="Recent trades" columns={columns} rows={rows} getRowId={(r) => r.id} emptyState="No trades yet" {...extra} />);

function bodyOrder(): string[] {
  const table = screen.getByRole("table", { hidden: true });
  return within(table)
    .getAllByRole("rowheader", { hidden: true })
    .map((el) => el.textContent ?? "");
}

describe("DataTable semantics", () => {
  it("renders caption, scope attributes and row headers", () => {
    const { container } = renderTable();
    expect(container.querySelector("caption")?.textContent).toBe("Recent trades");
    const headers = Array.from(container.querySelectorAll("thead th"));
    expect(headers.map((h) => h.getAttribute("scope"))).toEqual(["col", "col", "col"]);
    expect(Array.from(container.querySelectorAll("tbody th")).every((h) => h.getAttribute("scope") === "row")).toBe(true);
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.getAttribute("aria-labelledby")).toBe(container.querySelector("caption")?.id);
  });

  it("keeps the caption when empty or loading", () => {
    const { container, rerender } = renderTable({ rows: [] });
    expect(container.querySelector("caption")?.textContent).toBe("Recent trades");
    expect(container.textContent).toContain("No trades yet");
    rerender(<DataTable<Trade> caption="Recent trades" columns={columns} rows={[]} getRowId={(r) => r.id} emptyState="No trades yet" loading />);
    expect(container.querySelector("caption")?.textContent).toBe("Recent trades");
    expect(container.textContent).toContain("Loading…");
  });

  it("puts aria-sort only on the active th and toggles with clicks", () => {
    const { container } = renderTable();
    const sizeButton = container.querySelector('thead th:nth-child(2) button') as HTMLButtonElement;
    expect(container.querySelectorAll("[aria-sort]").length).toBe(0);
    fireEvent.click(sizeButton);
    const th = sizeButton.closest("th")!;
    expect(th.getAttribute("aria-sort")).toBe("ascending");
    expect(sizeButton.hasAttribute("aria-sort")).toBe(false);
    expect(container.querySelectorAll("[aria-sort]").length).toBe(1);
    // bigint beyond 2^53 sorts exactly: Gamma (5), Beta (...992), Alpha (...993)
    expect(bodyOrder()).toEqual(["Gamma", "Beta", "Alpha"]);
    fireEvent.click(sizeButton);
    expect(th.getAttribute("aria-sort")).toBe("descending");
    expect(bodyOrder()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("sorts buttons are real buttons operable from the keyboard", () => {
    const { container } = renderTable();
    const button = container.querySelector("thead th button") as HTMLButtonElement;
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("renders a labelled card list for small screens", () => {
    const { container } = renderTable();
    const list = container.querySelector("ul[aria-label='Recent trades']")!;
    expect(list.querySelectorAll("li").length).toBe(3);
    expect(list.querySelector("dt")?.textContent).toBe("Market");
    // hideOnMobile column is not in the cards
    expect(list.textContent).not.toContain("Note");
  });
});

describe("DataTable live mode", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const live = {
    mode: "prepend" as const,
    maxRows: 10,
    announce: (r: Trade) => `New trade in ${r.market}`,
    announceCount: (n: number) => `${n} new trades`,
    pendingLabel: (n: number) => `${n} new trades — show`,
  };

  const tableWith = (data: Trade[]) => <DataTable<Trade> caption="Recent trades" columns={columns} rows={data} getRowId={(r) => r.id} emptyState="none" live={live} />;
  const fresh = (id: string): Trade => ({ id, market: `M${id}`, size: 1n });

  it("buffers new rows while focus is inside and shows a button", () => {
    const { container, rerender } = render(tableWith(rows));
    const region = container.querySelector('[role="region"]') as HTMLElement;
    act(() => {
      fireEvent.focus(region);
    });
    rerender(tableWith([fresh("4"), ...rows]));
    expect(bodyOrder()).toEqual(["Alpha", "Beta", "Gamma"]);
    const button = screen.getByRole("button", { name: "1 new trades — show" });
    fireEvent.click(button);
    expect(bodyOrder()).toEqual(["M4", "Alpha", "Beta", "Gamma"]);
  });

  it("inserts immediately when nobody is reading", () => {
    const { rerender } = render(tableWith(rows));
    rerender(tableWith([fresh("4"), ...rows]));
    expect(bodyOrder()).toEqual(["M4", "Alpha", "Beta", "Gamma"]);
  });

  it("announces politely and reports a count for bursts", () => {
    const { rerender } = render(tableWith(rows));
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    rerender(tableWith([fresh("4"), ...rows]));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(status.textContent).toBe("New trade in M4");
    // Two more inside the 5 s window are batched into one count.
    rerender(tableWith([fresh("6"), fresh("5"), fresh("4"), ...rows]));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(status.textContent).toBe("New trade in M4");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(status.textContent).toBe("2 new trades");
  });

  it("never announces the rows present on first render", () => {
    render(tableWith(rows));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
