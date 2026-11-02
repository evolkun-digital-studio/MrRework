import "server-only";
import * as Sentry from "@sentry/node";

// Server-side error reporting — used by instrumentation.ts's onRequestError
// hook and any route handler that wants to record a caught exception.
// (Client Components use the separate src/lib/errorMonitoringClient.ts —
// this file is server-only and can't be imported from error.tsx/
// global-error.tsx.)
//
// Deliberately @sentry/node, not @sentry/nextjs: the latter's automatic
// Next.js build instrumentation broke static export entirely on this
// app's ~650 statically-generated product pages (`Cannot find module for
// page: /product/[slug]/page` on every one of them) the moment its
// sentry.*.config.ts/instrumentation-client.ts files were present, even
// without wrapping next.config.mjs. @sentry/node is a plain runtime SDK
// with no Next.js-specific build hooks, so it can't reproduce that
// failure — the tradeoff is no automatic source-map upload, which is a
// readability nicety in the Sentry dashboard, not a functional
// requirement (captureException still works and still reports the real
// stack trace, just against the built/minified output).
//
// Error-capture only — no performance tracing/profiling/session replay,
// matching the certification audit's actual finding ("no error
// monitoring"), not a request to add full APM.
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

// Always logs to the console first (structured, so it's greppable in
// whatever the hosting platform's log aggregation is — see the pre-launch
// certification audit's "Logging" finding), then reports to Sentry only if
// NEXT_PUBLIC_SENTRY_DSN is configured — same "real integration,
// gracefully absent until configured" pattern already used for mail
// (mail.ts) and PayPal.
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error("[error]", message, { context, stack });

  ensureInit();
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
}
