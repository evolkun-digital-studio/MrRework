"use client";
import { useEffect, useRef, useState } from "react";
import { User, Camera, Laptop } from "lucide-react";
import { useAdmin } from "@/components/admin/AdminProvider";
import { Card, Input, Button, Banner } from "@/components/admin/ui";

interface Session { id: string; userAgent: string; ip: string; createdAt: string; expiresAt: string }

function deviceLabel(ua: string): string {
  if (!ua) return "Unknown device";
  const os = /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : "Unknown OS";
  const browser = /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

export default function AdminProfilePage() {
  const { admin, setAdmin } = useAdmin();
  const fileRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState(admin.firstName);
  const [lastName, setLastName] = useState(admin.lastName);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [uploading, setUploading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);

  const [sessions, setSessions] = useState<Session[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/profile/sessions").then((res) => res.json()).then((data) => setSessions(data.items ?? []));
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg("");
    const res = await fetch("/api/admin/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName, lastName }) });
    const data = await res.json();
    if (res.ok) { setAdmin(data.user); setProfileMsg("Profile updated."); }
    setSavingProfile(false);
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/profile/avatar", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) setAdmin(data.user);
    setUploading(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword !== confirmPassword) { setPwMsg({ tone: "error", text: "Passwords do not match." }); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/admin/profile/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPwMsg({ tone: "neutral", text: "Password updated." });
    } catch (err) {
      setPwMsg({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setPwSaving(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/admin/profile/sessions?sessionId=${encodeURIComponent(id)}`, { method: "DELETE" });
    setSessions((s) => s?.filter((x) => x.id !== id) ?? null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Profile</h1>
        <p className="text-[12.5px] text-stone mt-1">Your admin account details and security.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <Card title="Avatar">
            <div className="flex items-center gap-5">
              <div className="relative w-16 h-16 rounded-full bg-paper-2 dark:bg-[#26221b] overflow-hidden grid place-items-center shrink-0">
                {admin.profileImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={admin.profileImage} alt="Your profile photo" className="w-full h-full object-cover" />
                ) : <User size={22} className="text-stone" />}
              </div>
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Camera size={13} /> {uploading ? "Uploading…" : "Upload photo"}
                </Button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onPickAvatar} />
              </div>
            </div>
          </Card>

          <Card title="Details">
            <form onSubmit={saveProfile} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <Input label="Email" value={admin.email ?? ""} disabled />
              {profileMsg && <Banner>{profileMsg}</Banner>}
              <Button type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save"}</Button>
            </form>
          </Card>

          <Card title="Change password">
            <form onSubmit={changePassword} className="space-y-3">
              <Input label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              {pwMsg && <Banner tone={pwMsg.tone}>{pwMsg.text}</Banner>}
              <Button type="submit" disabled={pwSaving}>{pwSaving ? "Saving…" : "Update password"}</Button>
            </form>
          </Card>
        </div>

        <Card title="Active sessions" description="Devices currently signed in to the admin panel.">
          {sessions === null ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-12 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
          ) : sessions.length === 0 ? (
            <p className="text-[12.5px] text-stone">No active sessions.</p>
          ) : (
            <ul className="divide-y divide-line dark:divide-[#332e26]">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <Laptop size={16} className="text-stone shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[13px] truncate">{deviceLabel(s.userAgent)}</div>
                      <div className="text-[11px] text-stone">Since {new Date(s.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => revoke(s.id)} className="text-[11px] uppercase tracking-wide underline hover:text-stone transition shrink-0">Revoke</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
