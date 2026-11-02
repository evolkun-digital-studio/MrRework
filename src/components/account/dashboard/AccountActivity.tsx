"use client";
import { memo } from "react";
import { SectionCard } from "@/components/account/ui";
import type { SafeUser } from "@/lib/account";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-line last:border-b-0">
      <span className="text-[13px] text-stone">{label}</span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  );
}

function AccountActivity({ account }: { account: SafeUser }) {
  return (
    <SectionCard title="Account activity">
      <div>
        <Row label="Recent login" value={account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : "—"} />
        <Row label="Last password change" value={account.passwordChangedAt ? new Date(account.passwordChangedAt).toLocaleDateString() : "Not set"} />
        <Row label="Newsletter" value={account.notificationSettings.newsletter ? "Subscribed" : "Not subscribed"} />
        <Row label="Two-factor authentication" value={account.twoFactorEnabled ? "Enabled" : "Disabled"} />
      </div>
    </SectionCard>
  );
}

export default memo(AccountActivity);
