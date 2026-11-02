"use client";
import * as Sentry from "@sentry/browser";

// Browser counterpart to src/lib/errorMonitoring.ts (server-only, can't be
// imported from a Client Component) — used only by error.tsx and
// global-error.tsx. Same @sentry/node-not-@sentry/nextjs reasoning as that
// file: @sentry/browser is a plain client SDK with no Next.js build hooks,
// so it can't reproduce the static-export breakage @sentry/nextjs caused.
let initialized = false;
function ensureInit() {
  if (initialized) return;
  initialized = true;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
    environment: process.env.NODE_ENV,
  });
}

export function captureErrorClient(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[error]", message, context);

  ensureInit();
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
}
