"use client";

import Script from "next/script";

// Ported from a raw <iframe> + iframe-resizer <script> embed. Both the
// external (src=) and inline <script> tags from that snippet are inert if
// dropped into dangerouslySetInnerHTML — browsers never execute <script>
// elements inserted via .innerHTML — so the library is loaded with
// next/script instead and iframeResize() is called from its onLoad, once
// the library is actually on the page. The iframe attributes and the
// iframeResize() options are otherwise unchanged from what was supplied.
declare global {
  interface Window {
    iframeResize?: (options: Record<string, unknown>, target: string) => void;
  }
}

export function HandpickFormEmbed() {
  return (
    <>
      {/* The form is an external document, so it cannot account for this
          site's fixed header. On phones the old iframe started at y=0 and
          its opening hero sat underneath the header. The mobile-only inset
          reserves the header plus notch/Dynamic-Island safe area; desktop
          deliberately remains unchanged. */}
      <main className="w-full px-4 pt-[var(--header-clearance)] sm:px-6 md:p-0">
        <iframe
          id="rv-frame"
          src="https://riaaj-vintage-form.vercel.app"
          title="MrRework Form"
        // The auto-resize handshake below depends on the child page
        // (hosted separately at riaaj-vintage-form.vercel.app, outside this
        // repo) — its own bundled resizer script collides with the one
        // @iframe-resizer/parent injects, so no size message ever arrives
        // and the iframe would otherwise sit at the browser's 150px default.
        // This floor keeps the form usable (its Welcome step alone measures
        // ~709px, Budget ~812px) until that's resolved on the form's hosting
        // side; it's a floor, not a fixed height, so a working resize can
        // still grow it. scrolling is "auto" (not the originally supplied
        // "no") for the same reason: several steps already exceed this
        // floor, and with the resize broken and no scrollbar, any step
        // taller than the floor pushed its own Next/Previous controls below
        // the visible area with no way to reach them.
          // On mobile this fills the visible space below the *actual* header
          // and follows dynamic browser-chrome changes. The child remains
          // natively scrollable when a form step exceeds a short viewport.
          // The desktop minimum is retained unchanged.
          className="w-full max-w-full min-h-[calc(100dvh-var(--header-clearance))] md:min-h-[760px]"
          style={{ width: "100%", border: 0, display: "block" }}
          scrolling="auto"
          allow="microphone; camera; autoplay; clipboard-write; fullscreen"
          allowFullScreen
        />
      </main>
      <Script
        src="https://cdn.jsdelivr.net/npm/@iframe-resizer/parent@5.5.5"
        strategy="afterInteractive"
        onLoad={() => {
          window.iframeResize?.(
            {
              license: "GPLv3",
              checkOrigin: ["https://riaaj-vintage-form.vercel.app"],
              waitForLoad: true,
              autoResize: true,
              sizeHeight: true,
              sizeWidth: false,
              tolerance: 2,
            },
            "#rv-frame",
          );
        }}
      />
    </>
  );
}
