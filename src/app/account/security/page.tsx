"use client";
import { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { Field, SectionCard, Toggle, Banner } from "@/components/account/ui";

interface DeviceSession { sessionId: string; device: string; ip: string; createdAt: string; lastSeenAt: string }

export default function SecurityPage() {
  const { account, setAccount } = useAccount();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);

  const [twoFactor, setTwoFactor] = useState(account.twoFactorEnabled);
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);

  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);

  useEffect(() => {
    fetch("/api/account/security/sessions").then((res) => res.json()).then((data) => setSessions(data.items ?? []));
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    if (newPassword.length < 8) {
      setPwMessage({ tone: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ tone: "error", text: "Passwords do not match." });
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch("/api/account/security/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update password.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setAccount({ ...account, hasPassword: true });
      setPwMessage({ tone: "neutral", text: "Password updated." });
    } catch (err) {
      setPwMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setPwSaving(false);
    }
  }

  async function toggleTwoFactor(enabled: boolean) {
    setTwoFactor(enabled);
    setTwoFactorSaving(true);
    try {
      const res = await fetch("/api/account/security/two-factor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error();
      setAccount({ ...account, twoFactorEnabled: enabled });
    } catch {
      setTwoFactor(!enabled);
    } finally {
      setTwoFactorSaving(false);
    }
  }

  async function forgetDevice(sessionId: string) {
    const res = await fetch(`/api/account/security/sessions?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) setSessions(data.items);
  }

  return (
    <div className="space-y-6">
      <SectionCard title={account.hasPassword ? "Change password" : "Set a password"} description="Used once full sign-in is available on this account.">
        <form onSubmit={changePassword} className="space-y-3 max-w-sm">
          {account.hasPassword && (
            <Field label="Current password" value={currentPassword} onChange={setCurrentPassword} type="password" autoComplete="current-password" />
          )}
          <Field label="New password" value={newPassword} onChange={setNewPassword} type="password" autoComplete="new-password" />
          <Field label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} type="password" autoComplete="new-password" />
          {pwMessage && <Banner tone={pwMessage.tone}>{pwMessage.text}</Banner>}
          <button type="submit" disabled={pwSaving} className="btn disabled:opacity-50"><span>{pwSaving ? "Saving…" : "Update password"}</span></button>
        </form>
      </SectionCard>

      <SectionCard title="Two-factor authentication" description="Add an extra step when signing in. Full verification will be available once sign-in launches.">
        <Toggle label="Enable two-factor authentication" checked={twoFactor} onChange={toggleTwoFactor} disabled={twoFactorSaving} />
      </SectionCard>

      <SectionCard title="Recent devices" description="Browsers and devices that have accessed this account.">
        {sessions === null ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-14 rounded-brand bg-paper-2 animate-pulse" />)}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-[12.5px] text-stone">No recorded activity yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.sessionId} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Laptop size={16} className="text-stone shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13.5px] truncate">{s.device || "Unknown device"}</div>
                    <div className="text-[11.5px] text-stone">Last active {new Date(s.lastSeenAt).toLocaleString()}</div>
                  </div>
                </div>
                <button type="button" onClick={() => forgetDevice(s.sessionId)} className="text-[11px] uppercase tracking-wide underline hover:text-stone transition shrink-0">Forget</button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
