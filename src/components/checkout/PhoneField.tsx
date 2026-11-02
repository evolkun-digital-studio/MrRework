"use client";
import { ChevronDown } from "lucide-react";
import type { CountryCode } from "libphonenumber-js/min";
import { PHONE_COUNTRIES, formatPhoneAsYouType } from "@/lib/phoneValidation";

interface Props {
  country: CountryCode;
  value: string;
  onCountryChange: (c: CountryCode) => void;
  onChange: (v: string) => void;
  error?: boolean;
}

// Mirrors the visual style of the plain <Field>/<SelectField> inputs used
// elsewhere in checkout — same label, border, radius and focus ring — but
// combines a country-code <select> (searchable by typing, like any native
// select) with a free-typing number input inside one bordered group so it
// reads as a single "Phone" field rather than two.
export default function PhoneField({ country, value, onCountryChange, onChange, error }: Props) {
  const id = "field-phone";
  const selected = PHONE_COUNTRIES.find((c) => c.code === country) ?? PHONE_COUNTRIES[0];

  return (
    <label className="block" htmlFor={id}>
      <span className="text-[11px] uppercase tracking-wide text-stone">Phone</span>
      <div
        className={`flex items-stretch mt-1.5 bg-white border rounded-2xl overflow-hidden transition-all ${
          error ? "border-ink" : "border-line focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/10"
        }`}
      >
        {/* The real <select> sits invisible on top (full country names,
            native search-by-typing, native mobile picker) so it stays fully
            accessible; the span underneath is what's actually seen, showing
            just the dial code so the collapsed field stays compact. */}
        <div className="relative flex items-center shrink-0 border-r border-line">
          <select
            aria-label="Country code"
            value={selected.code}
            onChange={(e) => onCountryChange(e.target.value as CountryCode)}
            className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} (+{c.dialCode})
              </option>
            ))}
          </select>
          <span className="flex items-center gap-1 pl-4 pr-3 py-3.5 text-[14px] font-mono pointer-events-none rounded-l-2xl peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink">
            +{selected.dialCode}
            <ChevronDown size={13} className="text-stone" />
          </span>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value}
          onChange={(e) => onChange(formatPhoneAsYouType(e.target.value, country))}
          aria-invalid={error}
          placeholder="7911 123456"
          className="flex-1 min-w-0 px-4 py-3.5 text-[14px] outline-none placeholder:text-stone"
        />
      </div>
    </label>
  );
}
