"use client";

/**
 * Keyboard command palette (Ctrl/Cmd+K).
 *
 * Built on the WAI-ARIA combobox pattern using Radix Dialog for the overlay.
 * Searches markets and navigation targets lazily. Every destructive action
 * (buy, disconnect) goes through the same review UI as the page flows.
 *
 * Issue #149.
 */

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";

export interface CommandItem {
  id: string;
  label: string;
  keywords?: string[];
  group?: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  items: CommandItem[];
  placeholder?: string;
}

export function CommandPalette({ items, placeholder = "Search…" }: CommandPaletteProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Open on Ctrl+K / Cmd+K.
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }, [items, query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      const item = filtered[cursor];
      if (item) {
        item.onSelect();
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          aria-label="Command palette"
          className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-900 shadow-2xl focus:outline-none"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="material-symbols-outlined text-zinc-400 text-xl" aria-hidden>
              search
            </span>
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded={filtered.length > 0}
              aria-controls="command-palette-listbox"
              aria-autocomplete="list"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none text-sm"
            />
            <kbd className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">esc</kbd>
          </div>

          <ul
            id="command-palette-listbox"
            role="listbox"
            className="max-h-80 overflow-y-auto py-2"
          >
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-zinc-500" role="option" aria-selected={false}>
                No results for &ldquo;{query}&rdquo;
              </li>
            ) : (
              filtered.map((item, idx) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={idx === cursor}
                  className={`mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    idx === cursor ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5"
                  }`}
                  onMouseEnter={() => setCursor(idx)}
                  onMouseDown={(e) => { e.preventDefault(); item.onSelect(); setOpen(false); }}
                >
                  {item.label}
                </li>
              ))
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
