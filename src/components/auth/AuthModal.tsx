"use client";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { Banner } from "@/components/account/ui";
import { useCustomerAuth, type AuthModalView } from "@/lib/customerAuthStore";
import { useCart, type CartItem } from "@/lib/store";
import { useWishlist } from "@/lib/wishlistStore";
import { useDialogBehavior } from "@/lib/useDialogBehavior";

// ---------------------------------------------------------------------------
// Presentation only below this line — no auth/session/API logic lives here
// beyond what already existed. This file was redesigned from a centered
// modal into a right-side sliding drawer (Shopify/Zara/COS-style); every
// fetch call, state field, and view-switching rule is unchanged from the
// previous version.
// ---------------------------------------------------------------------------

type ServerCartItem = {
  productId: string; slug?: string; name?: string; sku?: string; image?: string;
  price: number; size?: string; color?: string; quantity: number;
};
type ServerWishlistItem = {
  productId: string; slug?: string; name?: string; sku?: string; price: number;
  compareAtPrice?: number; image?: string; collection?: string; colors?: string[]; sizes?: string[];
  size?: string; color?: string; addedAt: string; available: boolean;
};

const OTP_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

// Pulls the just-merged server cart/wishlist into the local (localStorage)
// stores — mirrors CartSync.tsx/WishlistSync.tsx's own mapping exactly, just
// triggered right after login/verify/reset instead of on page mount, so the
// items merged server-side in mergeGuestCartIntoUser()/
// mergeGuestWishlistIntoUser() show up immediately without a full reload.
async function refreshCartAndWishlist() {
  try {
    const res = await fetch("/api/cart");
    if (res.ok) {
      const data: { items: ServerCartItem[] } = await res.json();
      const items: CartItem[] = data.items.map((i) => ({
        id: i.productId, slug: i.slug ?? "", name: i.name ?? "", sku: i.sku ?? "",
        price: i.price, image: i.image ?? "", size: i.size ?? "", color: i.color ?? "", quantity: i.quantity,
      }));
      useCart.getState().hydrateFromServer(items);
    }
  } catch {}
  try {
    const res = await fetch("/api/wishlist");
    if (res.ok) {
      const data: { items: ServerWishlistItem[] } = await res.json();
      useWishlist.getState().hydrateFromServer(
        data.items.map((i) => ({
          id: i.productId, slug: i.slug ?? "", name: i.name ?? "", sku: i.sku ?? "",
          price: i.price, compareAtPrice: i.compareAtPrice, image: i.image ?? "", collection: i.collection ?? "",
          colors: i.colors ?? [], sizes: i.sizes ?? [], size: i.size, color: i.color,
          addedAt: i.addedAt, available: i.available,
        }))
      );
    }
  } catch {}
}

// Plain iconless pill inputs — matches the Milano reference's simple
// "Your email*"/"Password*" fields (no left icon, moderate rounding, not
// the old bordered-with-icon "luxury minimal" treatment). Local to this
// file for the same reason the previous icon variants were: the shared
// src/components/account/ui.tsx <Field> is sized for profile-page density,
// not this modal's larger touch targets.
function AuthField({
  id, label, type = "text", value, onChange, autoComplete,
}: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string }) {
  return (
    <input
      id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={label}
      className="min-h-[52px] w-full rounded-xl border border-line bg-white px-5 text-[14.5px] text-ink outline-none transition-all duration-200 placeholder:text-stone hover:border-ink-2/40 focus:border-ink focus:ring-2 focus:ring-ink/10"
    />
  );
}

function AuthPasswordField({
  id, label, value, onChange, autoComplete,
}: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id} type={visible ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={label}
        className="min-h-[52px] w-full rounded-xl border border-line bg-white px-5 pr-12 text-[14.5px] text-ink outline-none transition-all duration-200 placeholder:text-stone hover:border-ink-2/40 focus:border-ink focus:ring-2 focus:ring-ink/10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-stone hover:text-ink transition-colors duration-200"
      >
        {visible ? <EyeOff size={18} strokeWidth={1.7} /> : <Eye size={18} strokeWidth={1.7} />}
      </button>
    </div>
  );
}

// Shared pill button styles — solid ink (primary submit) and outlined
// (secondary "Create Account"/toggle actions), matching the reference's two
// stacked full-width pill buttons.
const PILL_PRIMARY =
  "h-[52px] w-full rounded-full bg-ink text-white text-[15px] font-medium transition-all duration-200 hover:bg-ink-2 disabled:opacity-50 disabled:hover:bg-ink";
const PILL_SECONDARY =
  "h-[52px] w-full rounded-full border border-ink bg-white text-ink text-[15px] font-medium transition-colors duration-200 hover:bg-paper-2";

const TITLES: Record<AuthModalView, string> = {
  login: "Sign In",
  register: "Create Account",
  forgot: "Reset Password",
};

export default function AuthModal() {
  const { modalOpen, modalView, closeModal, setModalView, setUser } = useCustomerAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  // Set only when a login attempt fails specifically because the account's
  // email isn't verified yet — renders a "Resend Verification Code" link
  // under the error banner (see the not_verified branch in submitLogin).
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  // Drawer mount/animate lifecycle — plain CSS transitions (transform +
  // opacity), no animation library. `rendered` keeps the drawer in the DOM
  // for the full close transition; `animateIn` is flipped a frame after
  // mount so the browser paints the off-screen position first, then
  // transitions to on-screen (and reverses symmetrically on close).
  const [rendered, setRendered] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modalOpen) {
      setRendered(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
      return () => cancelAnimationFrame(raf);
    }
    setAnimateIn(false);
    const t = setTimeout(() => setRendered(false), 350);
    return () => clearTimeout(t);
  }, [modalOpen]);

  // Autofocus the first field once the drawer has finished opening (or the
  // view switches between login/register/forgot).
  useEffect(() => {
    if (!animateIn) return;
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [animateIn, modalView]);

  // Body scroll lock (bridged to Lenis) + Escape-to-close + Tab focus trap —
  // previously duplicated inline here (~30 lines, identical to
  // SearchOverlay.tsx's own copy); now the same shared hook MobileNav and
  // CartDrawer already use, so there's one implementation instead of three.
  // `close` (defined below) is a hoisted function declaration, so referencing
  // it here before its declaration is safe.
  useDialogBehavior(rendered, close, panelRef);

  useEffect(() => {
    if (!otpSent || emailVerified) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpSent, emailVerified]);

  function reset() {
    setFirstName(""); setLastName(""); setEmail(""); setPassword(""); setRememberMe(false); setMessage(null); setUnverifiedEmail(null);
    setOtpSent(false); setEmailVerified(false); setOtp(""); setVerifying(false); setResending(false);
    setSecondsLeft(OTP_TTL_SECONDS); setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  function switchView(view: AuthModalView) {
    reset();
    setModalView(view);
  }

  function close() {
    reset();
    closeModal();
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setUnverifiedEmail(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Surfaces a "Resend Verification Code" link under the error
        // banner instead of just the message text — the reason string
        // comes straight from /api/auth/login (see REASON_MESSAGES there).
        if (data.reason === "not_verified") setUnverifiedEmail(email.trim().toLowerCase());
        setMessage({ tone: "error", text: data.error || "Could not log in." });
        return;
      }
      setUser(data.user);
      await refreshCartAndWishlist();
      close();
    } catch {
      setMessage({ tone: "error", text: "Could not log in." });
    } finally {
      setSaving(false);
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setMessage({ tone: "error", text: "Password must be at least 8 characters." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${firstName} ${lastName}`.trim(), email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create account.");
      // Registration now issues an OTP instead of a verification link — the
      // dedicated /verify-email page (not this modal) owns entering it,
      // resending, and the expiry countdown.
      setEmail(data.email ?? email);
      setPassword("");
      setOtpSent(true);
      setSecondsLeft(OTP_TTL_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not create account." });
    } finally {
      setSaving(false);
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setMessage({ tone: "neutral", text: data.message ?? "If that account exists, we've sent a reset link." });
    } catch {
      setMessage({ tone: "error", text: "Could not send the reset link. Try again." });
    } finally {
      setSaving(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      setMessage({ tone: "error", text: "Enter the 6-digit code." });
      return;
    }
    setVerifying(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not verify this code.");
      setUser(data.user);
      await refreshCartAndWishlist();
      setEmailVerified(true);
      setMessage(null);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not verify this code." });
    } finally {
      setVerifying(false);
    }
  }

  async function resendOtp() {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.reason === "cooldown" && data.retryAfterSeconds) setResendCooldown(data.retryAfterSeconds);
        throw new Error(data.error || "Could not resend the code.");
      }
      setOtp("");
      setSecondsLeft(OTP_TTL_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setMessage({ tone: "neutral", text: data.message ?? "A new verification code has been sent." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not resend the code." });
    } finally {
      setResending(false);
    }
  }

  if (!rendered) return null;

  const SUBHEADS: Record<AuthModalView, string> = {
    login: "Please enter your details below to sign in.",
    register: "Please register below to create an account.",
    forgot: "Enter your email and we'll send you a link to reset your password.",
  };

  return (
    <>
      {/* Backdrop — dark overlay + subtle blur, click to close, fades with
          the same duration/easing as the panel scale/fade. */}
      <div
        className={`fixed inset-0 bg-[#111]/45 backdrop-blur-sm z-[2500] transition-opacity duration-[380ms] ease-brand ${animateIn ? "opacity-100" : "opacity-0"}`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Centered single-column card — simple, minimal, Milano-reference
          styled (no brand-image side panel). Fades in and scales 0.96 -> 1,
          same timing function used sitewide (ease-brand). Click on the
          transparent wrapper (outside the panel itself) closes, mirroring
          the previous drawer's backdrop-click behavior. */}
      <div
        className="fixed inset-0 z-[2501] flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={TITLES[modalView]}
          data-lenis-prevent
          className={`relative w-full max-w-[460px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[24px] bg-white shadow-[0_24px_70px_rgba(17,17,17,0.18)] px-6 py-9 sm:px-10 sm:py-11 transition-all duration-[380ms] ease-brand ${
            animateIn ? "opacity-100 scale-100" : "opacity-0 scale-[0.96]"
          }`}
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
        >
          <button
            type="button" onClick={close} aria-label="Close"
            className="absolute right-5 top-5 z-20 flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors duration-200 hover:bg-paper-2 hover:text-ink"
          >
            <X size={20} strokeWidth={1.75} />
          </button>

          <div className="text-center mb-8">
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
              {otpSent ? (emailVerified ? "Email verified" : "Verify your email") : TITLES[modalView]}
            </h2>
            <p className="mx-auto mt-2.5 max-w-[320px] text-[14px] leading-6 text-ink-2">
              {otpSent ? (emailVerified ? "Your email is confirmed and your account is ready." : `Enter the 6-digit code sent to ${email}.`) : SUBHEADS[modalView]}
            </p>
          </div>

          {otpSent ? (
            emailVerified ? (
              <div className="space-y-6 text-center">
                <div className="rounded-xl border border-line bg-paper-2 px-5 py-6 text-sm leading-6 text-ink-2">Your email has been verified successfully.</div>
                <button type="button" onClick={close} className={PILL_PRIMARY}>Continue shopping</button>
              </div>
            ) : (
              <form onSubmit={submitOtp} className="space-y-5">
                <label className="block" htmlFor="auth-otp">
                  <input id="auth-otp" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="min-h-[54px] w-full rounded-xl border border-line bg-white px-4 text-center text-2xl font-medium tracking-[0.38em] text-ink outline-none transition-all duration-200 placeholder:tracking-[0.28em] placeholder:text-stone focus:border-ink focus:ring-2 focus:ring-ink/10" />
                </label>
                <p className="text-center text-xs leading-5 text-ink-2">{secondsLeft > 0 ? <>Code expires in <span className="font-medium text-ink">{formatCountdown(secondsLeft)}</span></> : "This code has expired. Request a new one below."}</p>
                {message && <Banner tone={message.tone}>{message.text}</Banner>}
                <button type="submit" disabled={verifying || otp.length !== 6} className={PILL_PRIMARY}>{verifying ? "Verifying…" : "Verify email"}</button>
                <button type="button" onClick={resendOtp} disabled={resending || resendCooldown > 0} className="w-full text-center text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink disabled:opacity-50 disabled:no-underline">{resending ? "Resending…" : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}</button>
              </form>
            )
          ) : modalView === "login" && (
            <form onSubmit={submitLogin} className="space-y-4">
              <AuthField id="auth-email" label="Your email*" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <AuthPasswordField id="auth-password" label="Password*" value={password} onChange={setPassword} autoComplete="current-password" />

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1 text-[13.5px]">
                <label className="flex cursor-pointer items-center gap-2 text-ink-2">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 shrink-0 rounded border-line accent-[var(--ink)]" />
                  Remember me
                </label>
                <button type="button" onClick={() => switchView("forgot")} className="text-ink-2 transition-colors hover:text-ink">
                  Forgot your password?
                </button>
              </div>

              {message && <Banner tone={message.tone}>{message.text}</Banner>}
              {unverifiedEmail && (
                <button
                  type="button"
                  onClick={() => { setEmail(unverifiedEmail); setOtp(""); setOtpSent(true); setEmailVerified(false); setSecondsLeft(OTP_TTL_SECONDS); setResendCooldown(0); setMessage(null); }}
                  className="text-[12.5px] text-ink font-medium underline-offset-2 hover:underline transition-colors duration-200"
                >
                  Resend Verification Code
                </button>
              )}

              <div className="space-y-3 pt-2">
                <button type="submit" disabled={saving} className={PILL_PRIMARY}>
                  {saving ? "Signing In…" : "Login"}
                </button>
                <button type="button" onClick={() => switchView("register")} className={PILL_SECONDARY}>
                  Create Account
                </button>
              </div>

              <p className="pt-2 text-center text-[12.5px] leading-5 text-ink-2">
                By signing in, you agree to our <a href="/terms" className="text-ink underline underline-offset-2">Terms &amp; Conditions</a> and <a href="/privacy" className="text-ink underline underline-offset-2">Privacy Policy</a>.
              </p>
            </form>
          )}

          {!otpSent && modalView === "register" && (
            <form onSubmit={submitRegister} className="space-y-4">
              <AuthField id="auth-register-first-name" label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
              <AuthField id="auth-register-last-name" label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" />
              <AuthField id="auth-register-email" label="Your email*" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <AuthPasswordField id="auth-register-password" label="Password*" value={password} onChange={setPassword} autoComplete="new-password" />

              <p className="text-[12.5px] leading-5 text-ink-2">
                Your personal data will be used to support your experience throughout this website, to manage access to your account and for other purposes described in our{" "}
                <a href="/privacy" className="text-ink underline underline-offset-2">privacy policy.</a>
              </p>

              {message && <Banner tone={message.tone}>{message.text}</Banner>}

              <div className="space-y-3 pt-1">
                <button type="submit" disabled={saving} className={PILL_PRIMARY}>
                  {saving ? "Creating…" : "Create Account"}
                </button>
                <button type="button" onClick={() => switchView("login")} className={PILL_SECONDARY}>
                  Login
                </button>
              </div>
            </form>
          )}

          {!otpSent && modalView === "forgot" && (
            <form onSubmit={submitForgot} className="space-y-4">
              <AuthField id="auth-forgot-email" label="Your email*" type="email" value={email} onChange={setEmail} autoComplete="email" />

              {message && <Banner tone={message.tone}>{message.text}</Banner>}

              <div className="pt-2">
                <button type="submit" disabled={saving} className={PILL_PRIMARY}>
                  {saving ? "Sending…" : "Send Reset Link"}
                </button>
              </div>

              <p className="text-center text-[13px] text-ink-2 pt-1">
                <button type="button" onClick={() => switchView("login")} className="text-ink font-medium underline-offset-2 hover:underline transition-colors duration-200">
                  Back to Sign In
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
