"use client";

import type { KeyboardEvent } from "react";
import { Slider } from "radix-ui";
import { MAX_BPS, snapBps } from "@/lib/format/allocation";

export interface BpsSliderProps {
  id: string;
  /** Integer basis points, 0..10 000. */
  value: number;
  onValueChange: (value: number) => void;
  /** Fires when a pointer drag is released or a key press lands. */
  onValueCommit?: (value: number) => void;
  /** Arrow-key step in bps (default 10 = 0.1%). */
  step?: number;
  /** Shift+Arrow and PageUp/PageDown step in bps (default 1000 = 10%). */
  largeStep?: number;
  /** Visible label text is rendered by the caller; this names the slider for assistive tech. */
  label: string;
  /** Spoken value, e.g. "12.50% of balance, 125.00 USDC". */
  valueText: (bps: number) => string;
  disabled?: boolean;
  /** Tick positions in bps; decorative only (aria-hidden). */
  ticks?: number[];
  dir?: "ltr" | "rtl";
  /** id of an element labelling the slider; falls back to `label`. */
  labelledBy?: string;
  describedBy?: string;
}

const DEFAULT_TICKS = [0, 2500, 5000, 7500, 10_000];

/**
 * Radix-based slider in integer bps. Radix supplies Home/End/Arrow handling,
 * Pointer Events with pointer capture (mouse, touch, pen) and cleanup on
 * unmount, so there are no window listeners here.
 */
export function BpsSlider({
  id,
  value,
  onValueChange,
  onValueCommit,
  step = 10,
  largeStep = 1000,
  label,
  valueText,
  disabled,
  ticks = DEFAULT_TICKS,
  dir = "ltr",
  labelledBy,
  describedBy,
}: BpsSliderProps) {
  const clamp = (v: number) => snapBps(v, 1);

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    const increases = event.key === "PageUp" || (event.shiftKey && (event.key === "ArrowUp" || event.key === (dir === "rtl" ? "ArrowLeft" : "ArrowRight")));
    const decreases = event.key === "PageDown" || (event.shiftKey && (event.key === "ArrowDown" || event.key === (dir === "rtl" ? "ArrowRight" : "ArrowLeft")));
    if (!increases && !decreases) return;
    // Radix skips its own handling when the event is default-prevented.
    event.preventDefault();
    const next = clamp(value + (increases ? largeStep : -largeStep));
    if (next !== value) {
      onValueChange(next);
      onValueCommit?.(next);
    }
  };

  return (
    <div className="space-y-1">
      <Slider.Root
        id={id}
        className="relative flex h-6 w-full touch-none select-none items-center"
        min={0}
        max={MAX_BPS}
        step={step}
        value={[value]}
        dir={dir}
        disabled={disabled}
        onValueChange={(v) => onValueChange(clamp(v[0] ?? 0))}
        onValueCommit={(v) => onValueCommit?.(clamp(v[0] ?? 0))}
        onKeyDown={onKeyDown}
      >
        <Slider.Track className="relative h-2 grow overflow-hidden rounded-full bg-surface-container">
          <Slider.Range className="absolute h-full rounded-full bg-primary-container" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={labelledBy ? undefined : label}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-valuetext={valueText(value)}
          className="block h-6 w-6 cursor-grab rounded-full border-2 border-white bg-primary shadow-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        />
      </Slider.Root>
      <div aria-hidden="true" className="relative flex justify-between px-1 text-[10px] font-medium text-on-surface-variant">
        {ticks.map((tick) => (
          <span key={tick}>{tick / 100}%</span>
        ))}
      </div>
    </div>
  );
}
