// Phone formatting/validation helpers for the checkout "Phone" field
// (src/components/checkout/PhoneField.tsx) and its server-side mirror in
// orderCreation.ts. Uses libphonenumber-js/min (the smaller, client-safe
// build — no need for the full metadata set just to validate a checkout
// phone number) so a typo like a missing digit or wrong area-code length
// is caught before the order is placed, the same way cardValidation.ts
// catches a mistyped card number.

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

export interface PhoneCountry {
  code: CountryCode;
  dialCode: string;
  name: string;
}

// Built once at module load — getCountries()/getCountryCallingCode() are
// pure metadata lookups, and Intl.DisplayNames construction is the only
// non-trivial cost here, so this runs a single time per client bundle load.
export const PHONE_COUNTRIES: PhoneCountry[] = (() => {
  let displayNames: Intl.DisplayNames | undefined;
  try {
    displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    // Environments without Intl.DisplayNames (very old browsers) fall back
    // to showing the ISO code in place of a name below.
  }

  return getCountries()
    .map((code) => ({
      code,
      dialCode: getCountryCallingCode(code),
      name: displayNames?.of(code) || code,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
})();

export const DEFAULT_PHONE_COUNTRY: CountryCode = "GB";

// Formats the national-number portion as the customer types, e.g.
// "7911 123456" — never includes the "+<dial code>" prefix, since that's
// shown by the separate country-code selector next to this input.
export function formatPhoneAsYouType(nationalNumber: string, country: CountryCode): string {
  const digits = nationalNumber.replace(/[^\d]/g, "");
  const formatter = new AsYouType(country);
  const formatted = formatter.input(digits);
  // AsYouType occasionally echoes back a leading "+<dial code>" once it
  // recognizes an international prefix typed by the user — strip it back
  // out so the field only ever shows the national number.
  return formatted.replace(/^\+\d+\s*/, "");
}

export function isPhoneValid(nationalNumber: string, country: CountryCode): boolean {
  if (!nationalNumber.trim()) return false;
  return isValidPhoneNumber(nationalNumber, country);
}

// Canonical E.164 form (e.g. "+447911123456") sent to the server — combines
// the selected country with whatever the customer typed. Returns null for
// input that doesn't parse to a valid number for that country so callers
// never send a malformed value.
export function toE164(nationalNumber: string, country: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(nationalNumber, country);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

// Server-side mirror of the client check — accepts either a bare E.164
// string (what checkout now sends) or a national number that still needs a
// country hint, so older/manual API callers that only send a raw string
// aren't rejected outright as long as it's a plausible international number.
export function isStoredPhoneValid(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("+")) return isValidPhoneNumber(trimmed);
  // No "+" prefix and no country context — fall back to a loose sanity
  // check (digits only, plausible length) rather than rejecting values from
  // callers that predate this field's E.164 format.
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
