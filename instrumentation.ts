import type { Instrumentation } from "next";

// Captures errors Next.js's own request lifecycle surfaces outside the
// React component tree — a thrown error during route rendering/data
// fetching that never reaches error.tsx (e.g. it happens in a Server
// Component before the boundary can catch it), or an uncaught exception in
// a Route Handler. This is the server-side half of "no error monitoring
// integration" from the pre-launch certification audit; error.tsx and
// global-error.tsx (client-side boundaries) are the other half.
//
// Only meaningful in the Node.js runtime — src/lib/errorMonitoring.ts uses
// @sentry/node, which isn't Edge-compatible, and this app's middleware
// (the only Edge-runtime code here) is a lightweight cookie-presence check
// with no complex logic likely to throw, so an Edge-specific reporter
// wasn't worth the added surface area for this pass. Edge errors still
// reach whatever platform-level log aggregation exists, just not Sentry.
export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    console.error("[error]", error, { url: request.path, method: request.method });
    return;
  }
  const { captureError } = await import("@/lib/errorMonitoring");
  captureError(error, { url: request.path, method: request.method });
};
