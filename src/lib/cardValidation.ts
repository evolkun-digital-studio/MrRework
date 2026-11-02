// Card formatting/validation helpers for the Account > Payment Methods
// "saved cards on file" feature. Previously lived in
// src/components/checkout/PaymentMethodSelector.tsx alongside the checkout
// card-entry UI; extracted here when that checkout UI was removed (PayPal
// is now the only checkout payment method) since this account feature is
// unrelated to checkout and still needs these.

export function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

export function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function formatCvv(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4);
}

// Standard Luhn checksum — catches typos without needing a real processor.
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isCardNumberValid(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 13 && digits.length <= 16 && luhnValid(digits);
}

export function isExpiryValid(v: string): boolean {
  const m = v.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return false;
  const year = 2000 + Number(m[2]);
  const now = new Date();
  const expiry = new Date(year, month); // first day of the month *after* expiry
  return expiry > now;
}

export function isCvvValid(v: string): boolean {
  return /^\d{3,4}$/.test(v);
}
