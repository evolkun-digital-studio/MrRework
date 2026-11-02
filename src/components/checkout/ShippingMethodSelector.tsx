"use client";
import { formatPrice } from "@/lib/utils";
import type { ShippingMethod, ShippingOption } from "@/lib/pricing";

interface Props {
  options: (ShippingOption & { price: number })[];
  value: ShippingMethod;
  onChange: (m: ShippingMethod) => void;
}

export default function ShippingMethodSelector({ options, value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Shipping method" className="space-y-2.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <label
            key={o.id}
            className={`flex items-center gap-3.5 border rounded-brand px-4 py-3.5 cursor-pointer transition ${active ? "border-ink" : "border-line hover:border-ink/50"}`}
          >
            <input
              type="radio" name="shippingMethod" value={o.id} checked={active}
              onChange={() => onChange(o.id)}
              className="accent-[var(--ink)] w-4 h-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            />
            <span className="flex-1">
              <span className="block text-[14px] font-medium">{o.label}</span>
              <span className="block text-[12px] text-stone mt-0.5">{o.description}</span>
            </span>
            <span className="font-mono text-[13px] whitespace-nowrap">{o.price === 0 ? "Free" : formatPrice(o.price)}</span>
          </label>
        );
      })}
    </div>
  );
}
