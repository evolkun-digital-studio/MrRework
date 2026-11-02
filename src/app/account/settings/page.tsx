"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/account/AccountProvider";
import { SelectField, SectionCard, Field, Banner } from "@/components/account/ui";

const THEMES = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const LANGUAGES = [
  { value: "en", label: "English" }, { value: "fr", label: "Français" }, { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" }, { value: "it", label: "Italiano" }, { value: "nl", label: "Nederlands" },
];
const CURRENCIES = [
  { value: "EUR", label: "EUR — Euro" }, { value: "USD", label: "USD — US Dollar" },
  { value: "GBP", label: "GBP — British Pound" }, { value: "JPY", label: "JPY — Japanese Yen" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { account, setAccount } = useAccount();

  const [prefs, setPrefs] = useState({ theme: account.theme, language: account.language, currency: account.currency });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);

  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save preferences.");
      setAccount(data);
      setMessage({ tone: "neutral", text: "Preferences saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete your account.");
      router.push("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={savePrefs}>
        <SectionCard title="Preferences">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SelectField label="Theme" value={prefs.theme} onChange={(v) => setPrefs((p) => ({ ...p, theme: v }))} options={THEMES} />
            <SelectField label="Language" value={prefs.language} onChange={(v) => setPrefs((p) => ({ ...p, language: v }))} options={LANGUAGES} />
            <SelectField label="Currency" value={prefs.currency} onChange={(v) => setPrefs((p) => ({ ...p, currency: v }))} options={CURRENCIES} />
          </div>
          {message && <div className="mt-5"><Banner tone={message.tone}>{message.text}</Banner></div>}
          <button type="submit" disabled={saving} className="btn mt-5 disabled:opacity-50"><span>{saving ? "Saving…" : "Save preferences"}</span></button>
        </SectionCard>
      </form>

      <SectionCard title="Privacy">
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-[520px]">
          Your account data is used solely to operate your cart, wishlist, orders and the preferences on this page.
          It is never sold to third parties. You can request a full export or deletion of your data at any time using
          the option below.
        </p>
      </SectionCard>

      <SectionCard title="Delete account" description="Permanently remove your profile, addresses, payment methods and preferences. This cannot be undone.">
        <p className="text-[12.5px] text-stone mb-4">Type <span className="font-mono text-ink">DELETE</span> to confirm.</p>
        <div className="flex flex-col sm:flex-row gap-3 max-w-sm">
          <Field label="Confirmation" value={confirmText} onChange={setConfirmText} placeholder="DELETE" />
        </div>
        {deleteError && <div className="mt-4"><Banner tone="error">{deleteError}</Banner></div>}
        <button
          type="button" onClick={deleteAccount} disabled={confirmText !== "DELETE" || deleting}
          className="btn btn-ghost mt-4 disabled:opacity-40"
        >
          <span>{deleting ? "Deleting…" : "Delete my account"}</span>
        </button>
      </SectionCard>
    </div>
  );
}
