"use client";
import { useEffect, type RefObject } from "react";

// Shared dialog behavior for this app's overlay/drawer/modal components:
// body scroll lock (bridged to Lenis, the smooth-scroll library this site
// uses instead of native scrolling — see smooth-scroll.tsx, a plain
// `overflow:hidden` isn't reliably enough on its own), Escape-to-close, and
// a Tab focus trap scoped to the given container.
//
// Extracted from the identical inline implementation already proven
// correct in SearchOverlay.tsx and AuthModal.tsx (both left untouched, so
// zero regression risk to either) — every dialog-like surface added or
// fixed after this point (MobileNav, CartDrawer, LoginReminderModal) uses
// this one hook instead of a third/fourth/fifth copy of the same ~30 lines.
export function useDialogBehavior(open: boolean, onClose: () => void, containerRef: RefObject<HTMLElement | null>) {
  // `overflow: hidden` on <body> alone doesn't reliably stop iOS Safari's
  // own rubber-band/touch scroll of the page behind a fixed overlay — a
  // well-documented iOS-specific gap (the background can still shift under
  // touch even with overflow hidden set). The hardened fix is to also pin
  // body to `position: fixed` at its current scroll offset while open, then
  // restore both the styles and the scroll position on close — this is what
  // actually prevents background scroll on iOS, not overflow alone.
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prev = { overflow: body.overflow, position: body.position, top: body.top, width: body.width };
    body.overflow = "hidden";
    body.position = "fixed";
    body.top = `-${scrollY}px`;
    body.width = "100%";
    window.dispatchEvent(new Event("lenis:stop"));
    return () => {
      body.overflow = prev.overflow;
      body.position = prev.position;
      body.top = prev.top;
      body.width = prev.width;
      window.scrollTo(0, scrollY);
      window.dispatchEvent(new Event("lenis:start"));
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const container = containerRef.current;
        if (!container) return;
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')
        ).filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, containerRef]);
}
