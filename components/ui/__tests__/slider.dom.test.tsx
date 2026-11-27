import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BpsSlider } from "../slider";

function Harness({ initial = 5000, onChange }: { initial?: number; onChange?: (v: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <BpsSlider
      id="s"
      label="Share of balance"
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      valueText={(bps) => `${bps / 100}% of balance, ${bps / 10} USDC`}
    />
  );
}

describe("BpsSlider", () => {
  it("exposes slider semantics with aria-valuetext", () => {
    render(<Harness />);
    const thumb = screen.getByRole("slider");
    expect(thumb.getAttribute("aria-valuenow")).toBe("5000");
    expect(thumb.getAttribute("aria-valuemax")).toBe("10000");
    expect(thumb.getAttribute("aria-valuetext")).toBe("50% of balance, 500 USDC");
    expect(thumb.getAttribute("aria-label")).toBe("Share of balance");
  });

  it("Home sets 0 and End sets 10000", () => {
    render(<Harness />);
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "Home" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("0");
    fireEvent.keyDown(thumb, { key: "End" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("10000");
  });

  it("arrow keys step by 0.1% and PageUp/Shift+Arrow by the large step", () => {
    render(<Harness />);
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("5010");
    fireEvent.keyDown(thumb, { key: "PageUp" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("6010");
    fireEvent.keyDown(thumb, { key: "ArrowLeft", shiftKey: true });
    expect(thumb.getAttribute("aria-valuenow")).toBe("5010");
    fireEvent.keyDown(thumb, { key: "PageDown" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("4010");
  });

  it("clamps the large step at the ends", () => {
    render(<Harness initial={9500} />);
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "PageUp" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("10000");
  });

  it("does not attach window listeners itself", () => {
    const add = vi.spyOn(window, "addEventListener");
    const { unmount } = render(<Harness />);
    const types = add.mock.calls.map((c) => c[0]);
    expect(types).not.toContain("mousemove");
    expect(types).not.toContain("mouseup");
    expect(types).not.toContain("touchmove");
    unmount();
    add.mockRestore();
  });

  it("hides tick labels from assistive tech", () => {
    const { container } = render(<Harness />);
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden?.textContent).toContain("0%");
    expect(hidden?.textContent).toContain("100%");
  });
});
