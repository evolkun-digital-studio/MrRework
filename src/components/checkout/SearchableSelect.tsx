"use client";
import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import type { GeoOption } from "@/lib/geoData";

interface Props {
  label: string;
  value: string;
  options: GeoOption[];
  onChange: (value: string) => void;
  onSelect?: (option: GeoOption) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  loading?: boolean;
  autoComplete?: string;
  helperText?: string;
}

const MAX_VISIBLE = 50;

// Accessible combobox (ARIA 1.2 "combobox with list autocomplete" pattern)
// used for Country/State/City in LocationFields — a plain native <select>
// can't support type-to-filter over a list of thousands of cities.
// Deliberately accepts free-typed text that doesn't match any option (a
// postal-code lookup or a real place can land outside the bundled dataset)
// rather than forcing a strict pick-from-list value.
export default function SearchableSelect({
  label, value, options, onChange, onSelect, placeholder, disabled, error, loading, autoComplete, helperText,
}: Props) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const listboxId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const reactId = useId();

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return pool.slice(0, MAX_VISIBLE);
  }, [options, value]);

  function selectOption(option: GeoOption) {
    onChange(option.label);
    onSelect?.(option);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[highlighted]) {
        e.preventDefault();
        selectOption(filtered[highlighted]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <label className="block relative" htmlFor={id}>
      <span className="text-[11px] uppercase tracking-wide text-stone">{label}</span>
      <div className="relative mt-1.5">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[highlighted] ? `${reactId}-${highlighted}` : undefined}
          aria-invalid={error}
          autoComplete={autoComplete}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlighted(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={`w-full bg-white border rounded-2xl pl-4 pr-9 py-3.5 text-[14px] outline-none transition-all placeholder:text-stone disabled:bg-stone/5 disabled:cursor-not-allowed ${
            error ? "border-ink" : "border-line focus:border-ink focus:ring-2 focus:ring-ink/10"
          }`}
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-stone">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ChevronDown size={15} />}
        </span>

        {open && !disabled && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-10 mt-1.5 w-full max-h-60 overflow-auto bg-white border border-line rounded-2xl py-1.5 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-4 py-2.5 text-[13px] text-stone">No matches found.</li>
            ) : (
              filtered.map((option, i) => (
                <li
                  key={option.code}
                  id={`${reactId}-${i}`}
                  role="option"
                  aria-selected={i === highlighted}
                  // Prevents the input's blur (which would close this list
                  // before the click's own event finishes) from firing.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOption(option)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`px-4 py-2.5 text-[14px] cursor-pointer ${i === highlighted ? "bg-stone/10" : ""}`}
                >
                  {option.label}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {helperText && <span className="block mt-1.5 text-[12px] text-stone">{helperText}</span>}
    </label>
  );
}
