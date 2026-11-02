"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useCustomerAuth } from "@/lib/customerAuthStore";
import { useDialogBehavior } from "@/lib/useDialogBehavior";

const REMINDER_DELAY_MS = 10 * 60 * 1000; // 10 minutes
const DISMISSED_KEY = "epure_login_reminder_dismissed";

// A single, dismissible nudge after 10 minutes of browsing while logged
// out — never shown again in this browser session once dismissed (or acted
// on), via sessionStorage rather than localStorage: "current browser
// session" means it should reappear on a fresh tab/browser launch, unlike
// the cart/wishlist which persist across sessions.
export default function LoginReminderModal() {
  const { user, openModal } = useCustomerAuth();
  const [show, setShow] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) return; // already logged in — nothing to remind
    if (sessionStorage.getItem(DISMISSED_KEY)) return; // already handled this session

    const timer = setTimeout(() => {
      // Re-check at fire time — the visitor may have logged in, or another
      // tab may have dismissed it, since this timer was armed.
      if (!useCustomerAuth.getState().user && !sessionStorage.getItem(DISMISSED_KEY)) {
        setShow(true);
      }
    }, REMINDER_DELAY_MS);

    return () => clearTimeout(timer);
  }, [user]);

  // If the visitor logs in (e.g. via a different trigger) while this is
  // showing, it has nothing left to remind them of.
  useEffect(() => {
    if (user) setShow(false);
  }, [user]);

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  // Escape-to-close + a Tab focus trap scoped to the dialog panel — the
  // same shared behavior SearchOverlay/AuthModal already had and MobileNav
  // now also uses (see useDialogBehavior.ts). This modal previously had
  // dialog ARIA in place but neither of those two keyboard behaviors.
  useDialogBehavior(show, dismiss, dialogRef);

  function logIn() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
    openModal("login");
  }

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            className="fixed inset-0 bg-ink/40 z-[2400]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={dismiss}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Log in reminder"
            className="fixed inset-0 z-[2401] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
          >
            <motion.div
              className="w-full max-w-[380px] bg-paper border border-line rounded-brand p-7 text-center"
              initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex justify-end mb-2">
                <button type="button" onClick={dismiss} aria-label="Dismiss" className="hover:opacity-60 transition">
                  <X size={19} />
                </button>
              </div>
              <h2 className="text-[17px] font-medium mb-2">Still browsing?</h2>
              <p className="text-[13px] text-stone mb-6">
                Log in to save your cart and favourites, and check out faster next time.
              </p>
              <button
                type="button" onClick={logIn}
                className="w-full bg-ink text-paper rounded-brand py-3 text-[13px] font-medium tracking-wide uppercase transition hover:opacity-85"
              >
                Log in
              </button>
              <button type="button" onClick={dismiss} className="mt-3 text-[12.5px] text-stone hover:text-ink transition">
                Not now
              </button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
