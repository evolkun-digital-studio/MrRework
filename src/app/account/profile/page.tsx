"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { User, Camera } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { Field, SelectField, SectionCard, Banner } from "@/components/account/ui";

const GENDERS = [
  { value: "", label: "Prefer not to say" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Nederlands" },
];
const CURRENCIES = [
  { value: "EUR", label: "EUR — Euro" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "JPY", label: "JPY — Japanese Yen" },
];

export default function ProfilePage() {
  const { account, setAccount } = useAccount();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: account.firstName, lastName: account.lastName, email: account.email ?? "",
    phone: account.phone, dateOfBirth: account.dateOfBirth ? String(account.dateOfBirth).slice(0, 10) : "",
    gender: account.gender ?? "", country: account.country,
    language: account.language, currency: account.currency,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          dateOfBirth: form.dateOfBirth || null,
          gender: form.gender || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save your profile.");
      setAccount(data);
      setMessage({ tone: "neutral", text: "Profile updated." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/account/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not upload image.");
      setAccount(data);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  const displayName = [account.firstName, account.lastName].filter(Boolean).join(" ") || "Add your name";

  return (
    <div className="space-y-8">
      <SectionCard title="Profile picture">
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 rounded-full bg-paper-2 overflow-hidden grid place-items-center shrink-0">
            {account.profileImage ? (
              <Image src={account.profileImage} alt="Your profile photo" fill sizes="80px" className="object-cover" />
            ) : (
              <User size={26} className="text-stone" />
            )}
          </div>
          <div>
            <button
              type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="btn btn-ghost !py-2 !px-4 text-[12px] disabled:opacity-50"
            >
              <Camera size={14} /> <span>{uploading ? "Uploading…" : "Upload photo"}</span>
            </button>
            <p className="text-[11.5px] text-stone mt-2">JPG, PNG, WEBP or GIF. Max 4MB.</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onPickAvatar} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Overview">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-stone">Member since</dt>
            <dd className="text-[14px] mt-1">{account.memberSince ? new Date(account.memberSince).toLocaleDateString() : "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-stone">Last login</dt>
            <dd className="text-[14px] mt-1">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-stone">Account status</dt>
            <dd className="text-[14px] mt-1 capitalize">{account.status}</dd>
          </div>
        </dl>
      </SectionCard>

      <form onSubmit={save}>
        <SectionCard title="Personal information" description={displayName}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="First name" value={form.firstName} onChange={(v) => update("firstName", v)} autoComplete="given-name" />
              <Field label="Last name" value={form.lastName} onChange={(v) => update("lastName", v)} autoComplete="family-name" />
            </div>
            <Field label="Email" value={form.email} onChange={(v) => update("email", v)} type="email" autoComplete="email" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Phone number" value={form.phone} onChange={(v) => update("phone", v)} type="tel" autoComplete="tel" />
              <Field label="Date of birth" value={form.dateOfBirth} onChange={(v) => update("dateOfBirth", v)} type="date" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField label="Gender" value={form.gender} onChange={(v) => update("gender", v)} options={GENDERS} />
              <Field label="Country" value={form.country} onChange={(v) => update("country", v)} autoComplete="country-name" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField label="Language" value={form.language} onChange={(v) => update("language", v)} options={LANGUAGES} />
              <SelectField label="Currency" value={form.currency} onChange={(v) => update("currency", v)} options={CURRENCIES} />
            </div>
          </div>

          {message && <div className="mt-5"><Banner tone={message.tone}>{message.text}</Banner></div>}

          <button type="submit" disabled={saving} className="btn mt-6 disabled:opacity-50">
            <span>{saving ? "Saving…" : "Save changes"}</span>
          </button>
        </SectionCard>
      </form>
    </div>
  );
}
