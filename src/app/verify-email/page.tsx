"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, SectionCard, Banner } from "@/components/account/ui";
import { useCustomerAuth } from "@/lib/customerAuthStore";
import { useCart, type CartItem } from "@/lib/store";
import { useWishlist } from "@/lib/wishlistStore";

// Mirrors 10 minutes / 60 seconds server-side (see OTP_TTL_MS /
// OTP_RESEND_COOLDOWN_MS in src/lib/customerAuth.ts) — purely for the
// display countdowns below. The server is always the real authority: an
// expired or rate-limited request is rejected there regardless of what
// these local timers show.
const OTP_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

type ServerCartItem = {
  productId: string; slug?: string; name?: string; sku?: string; image?: string;
  price: number; size?: string; color?: string; quantity: number;
};
type ServerWishlistItem = {
  productId: string; slug?: string; name?: string; sku?: string; price: number;
  compareAtPrice?: number; image?: string; collection?: string; colors?: string[]; sizes?: string[];
  size?: string; color?: string; addedAt: string; available: boolean;
};

// Same mapping as AuthModal.tsx's refreshCartAndWishlist() (not exported
// from there, so duplicated here rather than introducing a shared module
// for one nine-line helper) — pulls the guest cart/wishlist that
// verify-otp just merged server-side into the local stores immediately.
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
          id: i.productId, slug: i.slug ?? "", name: i.name ?? "", sku: i.sku ?? "", price: i.price,
          compareAtPrice: i.compareAtPrice, image: i.image ?? "", collection: i.collection ?? "",
          colors: i.colors ?? [], sizes: i.sizes ?? [], size: i.size, color: i.color, addedAt: i.addedAt, available: i.available,
        }))
      );
    }
  } catch {}
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const setUser = useCustomerAuth((s) => s.setUser);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e) setEmail(e);
    else setMessage({ tone: "error", text: "No email address was provided. Please register or log in again." });
  }, []);

  // One ticking interval for both countdowns — each just clamps at 0
  // instead of stopping, so nothing needs to be torn down/recreated when a
  // resend restarts either timer.
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  async function submitVerify(e: React.FormEvent) {
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
      setMessage({ tone: "neutral", text: "Email verified — redirecting…" });
      setTimeout(() => router.push("/account"), 900);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not verify this code." });
      setVerifying(false);
    }
  }

  async function resend() {
    if (resendCooldown > 0 || resending) return;
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
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setSecondsLeft(OTP_TTL_SECONDS);
      setOtp("");
      setMessage({ tone: "neutral", text: data.message ?? "A new verification code has been sent." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not resend the code." });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 md:py-24">
      <h1 className="text-[22px] font-medium mb-1">Verify your email</h1>
      <p className="text-[13px] text-stone mb-6">Enter the 6-digit code we sent to your email address.</p>

      <SectionCard title="Email verification">
        <form onSubmit={submitVerify} className="space-y-4">
          <Field label="Email address" value={email} onChange={() => {}} disabled />

          <label className="block" htmlFor="otp-input">
            <span className="text-[11px] uppercase tracking-wide text-stone">Verification code</span>
            <input
              id="otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full mt-1.5 bg-white border border-line focus:border-ink focus:ring-2 focus:ring-ink/10 rounded-2xl px-4 py-3.5 text-center text-[28px] font-mono tracking-[0.5em] outline-none transition-all"
            />
          </label>

          <p className="text-[12.5px] text-stone text-center">
            {secondsLeft > 0 ? <>Code expires in <span className="font-medium text-ink">{formatCountdown(secondsLeft)}</span></> : "This code has expired — request a new one below."}
          </p>

          {message && <Banner tone={message.tone}>{message.text}</Banner>}

          <button
            type="submit"
            disabled={verifying || otp.length !== 6}
            className="w-full bg-ink text-paper rounded-brand py-3 text-[13px] font-medium tracking-wide uppercase disabled:opacity-50 transition hover:opacity-85"
          >
            {verifying ? "Verifying…" : "Verify"}
          </button>

          <button
            type="button"
            onClick={resend}
            disabled={resending || resendCooldown > 0}
            className="w-full text-[12.5px] text-stone hover:text-ink underline-offset-2 hover:underline transition-colors disabled:opacity-50 disabled:hover:no-underline"
          >
            {resending ? "Resending…" : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend OTP"}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
