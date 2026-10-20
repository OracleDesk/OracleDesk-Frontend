import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../dialog";

describe("Dialog Primitive", () => {
  it("renders with role dialog and accessible name", () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogTitle>Market Quick View</DialogTitle>
          <DialogDescription>Details about the market</DialogDescription>
          <button type="button">Inside Button</button>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(screen.getByRole("dialog", { name: "Market Quick View" })).toBeDefined();
    expect(screen.getByText("Details about the market")).toBeDefined();
  });

  it("calls onOpenChange(false) when Escape is pressed", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Market Quick View</DialogTitle>
          <DialogDescription>Description</DialogDescription>
          <button type="button">Action</button>
        </DialogContent>
      </Dialog>
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("focuses initialFocusRef when specified", () => {
    function TestComponent() {
      const inputRef = React.useRef<HTMLInputElement>(null);
      return (
        <Dialog open={true}>
          <DialogContent initialFocusRef={inputRef}>
            <DialogTitle>Dialog with Initial Focus</DialogTitle>
            <DialogDescription>Description</DialogDescription>
            <button type="button">First Element</button>
            <input ref={inputRef} data-testid="target-input" />
          </DialogContent>
        </Dialog>
      );
    }

    render(<TestComponent />);
    expect(document.activeElement).toBe(screen.getByTestId("target-input"));
  });

  it("closes via DialogClose button", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Closeable Dialog</DialogTitle>
          <DialogDescription>Description</DialogDescription>
          <DialogClose asChild>
            <button type="button">Close</button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
