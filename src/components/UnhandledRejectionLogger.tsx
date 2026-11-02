"use client";
import { useEffect } from "react";
import { captureErrorClient } from "@/lib/errorMonitoringClient";

// Turns an unhandled rejection's raw `reason` into a real Error before it's
// logged/reported. Next's dev overlay (createUnhandledError/
// onUnhandledRejection) just does `String(reason)` when `reason` isn't an
// Error — and a DOM Event's default toString() is the unhelpful
// "[object Event]". The most common source of a raw-Event rejection in an
// app like this is a third-party script's internal cross-frame messaging
// (e.g. the PayPal SDK's zoid/post-robot layer, loaded dynamically from
// paypal.com — not something this repo's own code can catch, since it lives
// entirely inside that remote bundle). This never re-throws — it only makes
// whatever reason a Promise actually rejected with legible.
function describeRejectionReason(reason: unknown): { message: string; error: Error } {
  if (reason instanceof Error) return { message: reason.message, error: reason };

  if (typeof Event !== "undefined" && reason instanceof Event) {
    const target = reason.target as (EventTarget & { tagName?: string; src?: string; currentSrc?: string }) | null;
    const detail = {
      eventType: reason.type,
      isTrusted: reason.isTrusted,
      targetTag: target?.tagName,
      targetSrc: target?.src ?? target?.currentSrc,
    };
    const message = `Unhandled rejection with a raw "${reason.type}" Event instead of an Error (likely a third-party script's internal promise, e.g. a payment SDK's cross-frame messaging) — ${JSON.stringify(detail)}`;
    return { message, error: new Error(message) };
  }

  const message = typeof reason === "string" ? reason : safeStringify(reason);
  return { message, error: new Error(message) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// Mounted once, app-wide (root layout — both storefront and admin), purely
// as a diagnostic net: it logs full detail on every unhandled rejection and
// forwards a real Error to Sentry, but deliberately doesn't call
// event.preventDefault() — a genuine first-party bug should still surface
// in the dev overlay, just with a readable message now instead of
// "[object Event]".
export default function UnhandledRejectionLogger() {
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const { message, error } = describeRejectionReason(event.reason);
      console.error("[unhandled-rejection]", message, event.reason);
      captureErrorClient(error, { source: "unhandledrejection" });
    }
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  return null;
}
