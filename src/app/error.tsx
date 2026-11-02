"use client";
import { useEffect } from "react";
import Link from "next/link";
import { captureErrorClient } from "@/lib/errorMonitoringClient";

// Catches any otherwise-uncaught error thrown while rendering this route
// segment (previously: Next's bare, unbranded default error UI, with
// nothing reporting the failure anywhere — see the pre-launch
// certification audit). Deliberately never renders `error.message` or
// `error.stack` — those can contain internal details (file paths, query
// values, third-party API responses) that shouldn't reach an end user;
// the real detail goes to captureError()'s console/Sentry reporting only.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureErrorClient(error, { digest: error.digest, boundary: "app/error.tsx" });
  }, [error]);

  return (
    <div className="min-h-[80dvh] grid place-items-center px-5 text-center">
      <div>
        <div className="font-display leading-none" style={{ fontWeight: 800, fontSize: "clamp(60px,14vw,160px)" }}>Oops</div>
        <p className="eyebrow mb-6">Something went wrong on our end</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button type="button" onClick={reset} className="btn"><span>Try again</span></button>
          <Link href="/" className="btn btn-ghost"><span>Back to home</span></Link>
        </div>
      </div>
    </div>
  );
}
