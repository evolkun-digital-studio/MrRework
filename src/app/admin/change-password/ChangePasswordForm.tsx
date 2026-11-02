"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Banner } from "@/components/admin/ui";

// Posts to the same /api/admin/profile/password endpoint the Profile >
// Security form already uses (currentPassword required either way) — the
// only difference on first login is *why* we're here (mustChangePassword),
// not a different API. That route clears mustChangePassword on success,
// which is what lets the redirect below actually reach the dashboard.
export default function ChangePasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update password.");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-line rounded-brand p-6 space-y-4">
      <Input label="Email" value={email} disabled />
      <Input label="Current (temporary) password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      <Input label="New password" type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      <Input label="Confirm new password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />

      {error && <Banner tone="error">{error}</Banner>}

      <Button type="submit" disabled={submitting} className="w-full justify-center">
        {submitting ? "Updating…" : "Update password & continue"}
      </Button>
    </form>
  );
}
