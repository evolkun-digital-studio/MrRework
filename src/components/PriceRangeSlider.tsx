"use client";
import { useEffect, useState } from "react";

interface PriceRangeSliderProps {
  min: number;
  max: number;
  step?: number;
  // null = no filter applied (full range) — mirrors how ShopClient's
  // Selected.price already worked before this replaced the fixed-band
  // checkbox list.
  value: [number, number] | null;
  onCommit: (value: [number, number] | null) => void;
  formatValue?: (n: number) => string;
}

// Two overlaid native <input type="range"> thumbs sharing one track — the
// standard dependency-free dual-handle slider pattern (no rc-slider/Radix
// needed): both inputs span the full width, but globals.css's
// .price-slider-input rules give pointer-events only to each one's own
// thumb (::-webkit-slider-thumb / ::-moz-range-thumb), so the two handles
// drag independently even though their tracks overlap pixel-for-pixel.
export default function PriceRangeSlider({ min, max, step = 1, value, onCommit, formatValue }: PriceRangeSliderProps) {
  const [localMin, setLocalMin] = useState(value?.[0] ?? min);
  const [localMax, setLocalMax] = useState(value?.[1] ?? max);

  // Re-syncs from outside — e.g. clicking the "Price" filter chip's ✕
  // resets sel.price to null elsewhere in ShopClient, which should move
  // both handles back to the full range rather than leaving them stranded
  // at their last dragged position.
  useEffect(() => {
    setLocalMin(value?.[0] ?? min);
    setLocalMax(value?.[1] ?? max);
  }, [value, min, max]);

  const fmt = formatValue ?? ((n: number) => `£${n}`);

  function commit(nextMin: number, nextMax: number) {
    // A range spanning the slider's full bounds is equivalent to "no price
    // filter" — reporting it as null keeps minPrice/maxPrice off the query
    // string when nothing is actually being filtered, and lets the "Price"
    // chip disappear exactly then too.
    onCommit(nextMin <= min && nextMax >= max ? null : [nextMin, nextMax]);
  }

  function handleMinChange(raw: number) {
    setLocalMin(Math.min(raw, localMax - step));
  }
  function handleMaxChange(raw: number) {
    setLocalMax(Math.max(raw, localMin + step));
  }

  const minPct = ((localMin - min) / (max - min)) * 100;
  const maxPct = ((localMax - min) / (max - min)) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 font-mono text-[12px] text-ink">
        <span>{fmt(localMin)}</span>
        <span>{fmt(localMax)}</span>
      </div>
      <div className="relative h-4 flex items-center">
        <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />
        <div className="absolute h-[3px] rounded-full bg-ink" style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }} />
        {/* Committing on release (mouse/touch/keyboard) rather than on every
            `onChange` tick avoids firing a network request per pixel of
            drag — ShopClient's buildQuery()/load() re-run whenever sel.price
            changes, so only the final value should trigger that. */}
        <input
          type="range" min={min} max={max} step={step} value={localMin}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          onMouseUp={() => commit(localMin, localMax)}
          onTouchEnd={() => commit(localMin, localMax)}
          onKeyUp={() => commit(localMin, localMax)}
          aria-label="Minimum price"
          className="price-slider-input absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none"
        />
        <input
          type="range" min={min} max={max} step={step} value={localMax}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          onMouseUp={() => commit(localMin, localMax)}
          onTouchEnd={() => commit(localMin, localMax)}
          onKeyUp={() => commit(localMin, localMax)}
          aria-label="Maximum price"
          className="price-slider-input absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none"
        />
      </div>
    </div>
  );
}
