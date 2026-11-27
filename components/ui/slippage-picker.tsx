"use client";

import { useId, useState } from "react";
import { RadioGroup } from "radix-ui";
import { MAX_SLIPPAGE_BPS, MIN_SLIPPAGE_BPS, slippageBpsFromInput } from "@/lib/format/allocation";

export const HIGH_SLIPPAGE_BPS = 500;
export const DEFAULT_SLIPPAGE_PRESETS = [50, 100, 300];

export interface SlippagePickerProps {
  /** Selected slippage in integer bps. */
  value: number;
  onChange: (bps: number) => void;
  presets?: number[];
  min?: number;
  max?: number;
  dir?: "ltr" | "rtl";
  disabled?: boolean;
}

const CUSTOM = "custom";

function percentText(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""}%`;
}

/**
 * Radio group of slippage presets plus a validated custom percent. Always
 * emits integer basis points.
 */
export function SlippagePicker({
  value,
  onChange,
  presets = DEFAULT_SLIPPAGE_PRESETS,
  min = MIN_SLIPPAGE_BPS,
  max = MAX_SLIPPAGE_BPS,
  dir = "ltr",
  disabled,
}: SlippagePickerProps) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const errorId = `${uid}-error`;
  const warnId = `${uid}-warn`;
  const inputId = `${uid}-custom`;

  const isPreset = presets.includes(value);
  const [customChosen, setCustomChosen] = useState(!isPreset);
  const customActive = customChosen || !isPreset;
  const [text, setText] = useState(() => (isPreset ? "" : percentText(value).replace("%", "")));
  const [error, setError] = useState<string | null>(null);

  const select = (next: string) => {
    if (next === CUSTOM) {
      setCustomChosen(true);
      return;
    }
    setCustomChosen(false);
    setError(null);
    onChange(Number(next));
  };

  const onCustomChange = (input: string) => {
    setText(input);
    if (input.trim() === "") {
      setError("Enter a slippage percent, like 0.5.");
      return;
    }
    const parsed = slippageBpsFromInput(input);
    if (!parsed.ok) {
      setError(
        parsed.reason === "format"
          ? "Enter a percent with up to two decimals, like 0.5."
          : parsed.reason === "too-low"
            ? `Slippage must be at least ${percentText(Math.max(min, MIN_SLIPPAGE_BPS))}.`
            : `Slippage can be at most ${percentText(Math.min(max, MAX_SLIPPAGE_BPS))}.`,
      );
      return;
    }
    if (parsed.bps < min) {
      setError(`Slippage must be at least ${percentText(min)}.`);
      return;
    }
    if (parsed.bps > max) {
      setError(`Slippage can be at most ${percentText(max)}.`);
      return;
    }
    setError(null);
    onChange(parsed.bps);
  };

  const itemClass =
    "flex min-h-8 cursor-pointer items-center gap-2 rounded border border-outline-variant bg-white px-3 py-1 text-[11px] font-bold text-on-surface-variant transition-all hover:border-primary focus-visible:ring-2 focus-visible:ring-primary data-[state=checked]:border-2 data-[state=checked]:border-primary data-[state=checked]:text-primary";
  const showWarn = value > HIGH_SLIPPAGE_BPS && (!customActive || error === null);

  return (
    <div className="space-y-2">
      <span id={labelId} className="font-label-caps text-label-caps text-on-surface-variant uppercase text-[10px]">
        Slippage tolerance
      </span>
      <RadioGroup.Root
        aria-labelledby={labelId}
        value={customActive ? CUSTOM : String(value)}
        onValueChange={select}
        dir={dir}
        disabled={disabled}
        orientation="horizontal"
        className="flex flex-wrap gap-2"
      >
        {presets.map((bps) => (
          <RadioGroup.Item key={bps} value={String(bps)} className={itemClass}>
            {percentText(bps)}
          </RadioGroup.Item>
        ))}
        <RadioGroup.Item value={CUSTOM} className={itemClass}>
          Custom
        </RadioGroup.Item>
      </RadioGroup.Root>
      {customActive && (
        <div className="space-y-1">
          <label htmlFor={inputId} className="block text-[11px] text-on-surface-variant">
            Custom slippage (%)
          </label>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            disabled={disabled}
            onChange={(event) => onCustomChange(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : showWarn ? warnId : undefined}
            className="w-28 rounded border border-outline-variant bg-white px-3 py-2 font-data-mono text-sm"
          />
          {error && (
            <p id={errorId} className="text-[11px] text-error">
              {error}
            </p>
          )}
        </div>
      )}
      {showWarn && (
        <p id={warnId} className="text-[11px] font-bold text-error">
          High slippage: you may receive far fewer shares
        </p>
      )}
    </div>
  );
}
