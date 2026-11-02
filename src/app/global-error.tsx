"use client";
import { useEffect } from "react";
import { captureErrorClient } from "@/lib/errorMonitoringClient";

// The root-layout equivalent of error.tsx — only fires if the root layout
// itself (src/app/layout.tsx) throws, which error.tsx can't catch since it
// renders *inside* that layout. Must render its own complete <html>/<body>
// (replacing the root layout entirely while active), so it deliberately
// doesn't depend on layout.tsx's fonts/providers being available. Same
// rule as error.tsx: never render the raw error message/stack to the user.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    captureErrorClient(error, { digest: error.digest, boundary: "app/global-error.tsx" });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#FFFFFF", color: "#111111" }}>
        <div style={{ minHeight: "80vh", display: "grid", placeItems: "center", padding: "0 20px", textAlign: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "clamp(60px,14vw,160px)", lineHeight: 1 }}>Oops</div>
            <p style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 13, color: "#6B6B6B", margin: "0 0 24px" }}>
              Something went wrong on our end
            </p>
            <a
              href="/"
              style={{
                display: "inline-block", padding: "14px 28px", border: "1px solid #111111",
                borderRadius: 9999, background: "#111111", color: "#FFFFFF", textDecoration: "none", fontSize: 13,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
