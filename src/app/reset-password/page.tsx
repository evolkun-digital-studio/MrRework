"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, SectionCard, Banner } from "@/components/account/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) setMessage({ tone: "error", text: "This reset link is missing its token. Request a new one." });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      setMessage({ tone: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ tone: "error", text: "Passwords do not match." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reset password.");
      setMessage({ tone: "neutral", text: "Password updated. Redirecting…" });
      setTimeout(() => router.push("/account"), 1200);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not reset password." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 md:py-24">
      <h1 className="text-[22px] font-medium mb-1">Reset your password</h1>
      <p className="text-[13px] text-stone mb-6">Choose a new password for your account.</p>

      <SectionCard title="New password">
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
          <Field label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
          {message && <Banner tone={message.tone}>{message.text}</Banner>}
          <button
            type="submit"
            disabled={saving || !token}
            className="w-full bg-ink text-paper rounded-brand py-3 text-[13px] font-medium tracking-wide uppercase disabled:opacity-50 transition hover:opacity-85"
          >
            {saving ? "Saving…" : "Reset password"}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
