"use client";
import { useEffect, useRef, useState } from "react";
import { Shield, UserPlus, X } from "lucide-react";
import { Card, Table, Th, Td, Badge, Button, Input, EmptyState, Banner } from "@/components/admin/ui";
import { useDialogBehavior } from "@/lib/useDialogBehavior";

interface ChildAdminRow {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: "active" | "suspended";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AdminManagementClient() {
  const [items, setItems] = useState<ChildAdminRow[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/admin-management")
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]));
  }

  useEffect(() => { load(); }, []);

  async function toggleStatus(row: ChildAdminRow) {
    const next = row.status === "active" ? "suspended" : "active";
    if (next === "suspended" && !confirm(`Disable ${row.email}? They'll be signed out everywhere immediately.`)) return;
    setBusyId(row._id);
    setBanner(null);
    const res = await fetch(`/api/admin/admin-management/${row._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
    });
    const data = await res.json();
    if (!res.ok) { setBanner({ tone: "error", text: data.error ?? "Failed to update status." }); setBusyId(null); return; }
    setItems((cur) => cur?.map((r) => (r._id === row._id ? { ...r, status: next } : r)) ?? cur);
    setBusyId(null);
  }

  async function resetPassword(row: ChildAdminRow) {
    if (!confirm(`Reset ${row.email}'s password? A new temporary password will be emailed to them and they'll be signed out everywhere.`)) return;
    setBusyId(row._id);
    setBanner(null);
    const res = await fetch(`/api/admin/admin-management/${row._id}/reset-password`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setBanner({ tone: "error", text: data.error ?? "Failed to reset password." }); setBusyId(null); return; }
    setBanner({ tone: "neutral", text: `A new temporary password was emailed to ${row.email}.` });
    setItems((cur) => cur?.map((r) => (r._id === row._id ? { ...r, mustChangePassword: true } : r)) ?? cur);
    setBusyId(null);
  }

  async function remove(row: ChildAdminRow) {
    if (!confirm(`Delete ${row.email}? This permanently removes their admin account.`)) return;
    setBusyId(row._id);
    setBanner(null);
    const res = await fetch(`/api/admin/admin-management/${row._id}`, { method: "DELETE" });
    if (!res.ok) { const data = await res.json().catch(() => ({})); setBanner({ tone: "error", text: data.error ?? "Failed to delete admin." }); setBusyId(null); return; }
    setItems((cur) => cur?.filter((r) => r._id !== row._id) ?? cur);
    setBusyId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-semibold">Admin Management</h1>
          <p className="text-[12.5px] text-stone mt-1">Invite and manage Child Admins. Only Parent Admins can see this page.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}><UserPlus size={14} /> Invite Child Admin</Button>
      </div>

      {banner && <Banner tone={banner.tone}>{banner.text}</Banner>}

      <Card>
        {items === null ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Shield size={28} strokeWidth={1.3} />}
            title="No Child Admins yet"
            description="Invite someone to give them full store access without admin-management rights."
            action={<Button size="sm" onClick={() => setInviteOpen(true)}><UserPlus size={14} /> Invite Child Admin</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>Email</Th><Th>Status</Th><Th>Password</Th><Th>Last login</Th><Th>Invited</Th><Th /></tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id}>
                  <Td>{[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}</Td>
                  <Td className="max-w-[220px] truncate">{row.email}</Td>
                  <Td><Badge tone={row.status === "active" ? "success" : "danger"}>{row.status}</Badge></Td>
                  <Td>{row.mustChangePassword ? <Badge tone="warning">Pending first login</Badge> : <Badge tone="neutral">Set</Badge>}</Td>
                  <Td>{row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : "Never"}</Td>
                  <Td>{new Date(row.createdAt).toLocaleDateString()}</Td>
                  <Td>
                    <div className="flex items-center gap-3 justify-end whitespace-nowrap">
                      <button type="button" disabled={busyId === row._id} onClick={() => toggleStatus(row)} className="text-[11px] uppercase tracking-wide underline hover:text-stone transition disabled:opacity-40">
                        {row.status === "active" ? "Disable" : "Enable"}
                      </button>
                      <button type="button" disabled={busyId === row._id} onClick={() => resetPassword(row)} className="text-[11px] uppercase tracking-wide underline hover:text-stone transition disabled:opacity-40">
                        Reset password
                      </button>
                      <button type="button" disabled={busyId === row._id} onClick={() => remove(row)} className="text-[11px] uppercase tracking-wide underline text-[#4a1414] dark:text-[#e08585] hover:opacity-70 transition disabled:opacity-40">
                        Delete
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {inviteOpen && (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onInvited={() => { setInviteOpen(false); setBanner({ tone: "neutral", text: "Invitation sent." }); load(); }}
        />
      )}
    </div>
  );
}

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDialogBehavior(true, onClose, containerRef);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await fetch("/api/admin/admin-management", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to invite admin."); setSubmitting(false); return; }
    onInvited();
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Invite Child Admin"
        className="relative w-full h-full sm:h-auto sm:max-w-md overflow-y-auto bg-paper dark:bg-[#1a1712] border-0 sm:border border-line dark:border-[#332e26] rounded-none sm:rounded-brand shadow-none sm:shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-[#332e26]">
          <h2 className="text-[15px] font-semibold">Invite Child Admin</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <p className="text-[12.5px] text-stone">
            They'll get full access to manage the store — products, orders, customers, everything except admin accounts. A temporary password is emailed to them and they'll be asked to set their own on first login.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Last name" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

          {error && <Banner tone="error">{error}</Banner>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Sending…" : "Send invitation"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
