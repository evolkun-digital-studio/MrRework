// Client-safe email check for the checkout "Email" field
// (src/components/checkout/EmailField.tsx). Mirrors EMAIL_RE in
// src/lib/customerAuth.ts exactly — that module is server-only, so this is a
// deliberate duplicate rather than an import, kept identical so "valid on
// the form" and "valid to the server" never drift apart.
import { z } from "zod";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailSchema = z.string().trim().min(1, "Email is required.").regex(EMAIL_RE, "Wrong email entered. Please enter a valid email address.");

export function isEmailValid(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
