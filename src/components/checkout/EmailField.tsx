"use client";
import { useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { isEmailValid } from "@/lib/emailValidation";

interface Props {
  value: string;
  onChange: (v: string) => void;
  // Set by the parent's required-field check on a submit attempt (blank
  // field) — separate from this field's own real-time format validation,
  // which only ever fires once the customer has actually typed something.
  error?: boolean;
}

// Real-time email validation for checkout's "Email" field: green
// border/check once the value is a well-formed address, red border + inline
// alert once it's been touched and isn't. Deliberately checked against the
// same regex as EMAIL_RE in src/lib/customerAuth.ts (duplicated in
// src/lib/emailValidation.ts since that module is server-only) so a value
// this field accepts is never rejected again by the server.
export default function EmailField({ value, onChange, error }: Props) {
  const [touched, setTouched] = useState(false);
  const trimmed = value.trim();
  const valid = trimmed.length > 0 && isEmailValid(trimmed);
  const formatInvalid = touched && trimmed.length > 0 && !valid;
  const showRedBorder = error || formatInvalid;

  return (
    <label className="block" htmlFor="field-email">
      <span className="text-[11px] uppercase tracking-wide text-stone">Email</span>
      <div className="relative mt-1.5">
        <input
          id="field-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showRedBorder}
          aria-describedby={formatInvalid ? "field-email-error" : undefined}
          className={`w-full bg-white border rounded-2xl pl-4 pr-10 py-3.5 text-[14px] outline-none transition-all placeholder:text-stone ${
            showRedBorder
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
              : valid
                ? "border-green-dark focus:border-green-dark focus:ring-2 focus:ring-green-dark/10"
                : "border-line focus:border-ink focus:ring-2 focus:ring-ink/10"
          }`}
        />
        {(valid || showRedBorder) && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            {valid ? <Check size={16} className="text-green-dark" /> : <AlertCircle size={16} className="text-red-500" />}
          </span>
        )}
      </div>
      {formatInvalid && (
        <p id="field-email-error" role="alert" className="mt-1.5 text-[12px] text-red-500">
          Wrong email entered. Please enter a valid email address.
        </p>
      )}
    </label>
  );
}
