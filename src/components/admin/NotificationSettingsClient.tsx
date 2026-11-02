"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Card, Button, Banner, EmptyState } from "@/components/admin/ui";

interface AdminRow {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
}

export default function NotificationSettingsClient() {
  const [self, setSelf] = useState<AdminRow | null>(null);
  const [children, setChildren] = useState<AdminRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/admin-management/notifications")
      .then((res) => res.json())
      .then((data) => { setSelf(data.self ?? null); setChildren(data.children ?? []); })
      .catch(() => setChildren([]));
  }, []);

  function toggleSelf() {
    setSelf((s) => (s ? { ...s, enabled: !s.enabled } : s));
  }
  function toggleChild(id: string) {
    setChildren((cur) => cur?.map((c) => (c._id === id ? { ...c, enabled: !c.enabled } : c)) ?? cur);
  }

  async function save() {
    if (!self) return;
    setSaving(true);
    setBanner(null);
    const settings = [{ adminId: self._id, enabled: self.enabled }, ...(children ?? []).map((c) => ({ adminId: c._id, enabled: c.enabled }))];
    const res = await fetch("/api/admin/admin-management/notifications", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }),
    });
    const data = await res.json();
    if (!res.ok) { setBanner({ tone: "error", text: data.error ?? "Failed to save preferences." }); setSaving(false); return; }
    setBanner({ tone: "neutral", text: "Preferences saved." });
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Email Notifications</h1>
        <p className="text-[12.5px] text-stone mt-1">Choose who gets emailed when a new customer registers.</p>
      </div>

      {banner && <Banner tone={banner.tone}>{banner.text}</Banner>}

      <Card title="New customer registrations">
        {self === null || children === null ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : (
          <div className="space-y-1">
            <ToggleRow
              label={`${[self.firstName, self.lastName].filter(Boolean).join(" ") || self.email} (you)`}
              sub={self.email}
              checked={self.enabled}
              onChange={toggleSelf}
            />
            {children.length === 0 ? (
              <EmptyState icon={<Bell size={24} strokeWidth={1.3} />} title="No Child Admins yet" description="Invite one from Admin Management to give them a notification preference here." />
            ) : (
              children.map((c) => (
                <ToggleRow
                  key={c._id}
                  label={[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
                  sub={c.email}
                  checked={c.enabled}
                  onChange={() => toggleChild(c._id)}
                />
              ))
            )}
          </div>
        )}
      </Card>

      <Button onClick={save} disabled={saving || self === null}>{saving ? "Saving…" : "Save preferences"}</Button>
    </div>
  );
}

function ToggleRow({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3 border-b border-line dark:border-[#332e26] last:border-b-0 cursor-pointer">
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate">{label}</div>
        <div className="text-[11.5px] text-stone truncate">{sub}</div>
      </div>
      <span className="flex items-center gap-2.5 shrink-0">
        <span className="text-[11px] uppercase tracking-wide text-stone">Receive registration emails</span>
        <input type="checkbox" checked={checked} onChange={onChange} className="w-5 h-5 accent-[var(--ink)]" />
      </span>
    </label>
  );
}
