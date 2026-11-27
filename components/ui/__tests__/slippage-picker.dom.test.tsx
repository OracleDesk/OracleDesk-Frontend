import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SlippagePicker } from "../slippage-picker";

function Harness({ initial = 100, onBps }: { initial?: number; onBps?: (v: number) => void }) {
  const [bps, setBps] = useState(initial);
  return (
    <SlippagePicker
      value={bps}
      onChange={(v) => {
        setBps(v);
        onBps?.(v);
      }}
    />
  );
}

describe("SlippagePicker", () => {
  it("renders a labelled radio group with presets and Custom", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Slippage tolerance" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["0.5%", "1%", "3%", "Custom"]);
    expect(screen.getByRole("radio", { name: "1%" }).getAttribute("aria-checked")).toBe("true");
  });

  it("selecting a preset emits integer bps", () => {
    const seen: number[] = [];
    render(<Harness onBps={(v) => seen.push(v)} />);
    fireEvent.click(screen.getByRole("radio", { name: "3%" }));
    expect(seen).toEqual([300]);
  });

  it("custom value is validated and emitted as bps", () => {
    const seen: number[] = [];
    render(<Harness onBps={(v) => seen.push(v)} />);
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    const input = screen.getByLabelText("Custom slippage (%)");
    fireEvent.change(input, { target: { value: "1e2" } });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const errorId = input.getAttribute("aria-describedby");
    expect(errorId && document.getElementById(errorId)?.textContent).toMatch(/two decimals/);
    expect(seen).toEqual([]);
    fireEvent.change(input, { target: { value: "0.25" } });
    expect(seen).toEqual([25]);
    expect(input.getAttribute("aria-invalid")).toBe("false");
  });

  it("warns in text above 5%", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Custom slippage (%)"), { target: { value: "6" } });
    expect(screen.getByText("High slippage: you may receive far fewer shares")).toBeTruthy();
  });
});
