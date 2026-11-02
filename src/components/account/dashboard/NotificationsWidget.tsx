"use client";
import { memo } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { SectionCard } from "@/components/account/ui";
import type { SafeUser } from "@/lib/account";

function Row({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      {enabled ? <Check size={14} className="text-ink shrink-0" /> : <X size={14} className="text-stone shrink-0" />}
      <span className={`text-[13px] ${enabled ? "" : "text-stone"}`}>{label} {enabled ? "enabled" : "disabled"}</span>
    </div>
  );
}

function NotificationsWidget({ notificationSettings }: { notificationSettings: SafeUser["notificationSettings"] }) {
  return (
    <SectionCard
      title="Notifications"
      action={
        <Link href="/account/notifications" className="text-[11px] uppercase tracking-wide underline hover:text-stone transition shrink-0">
          Manage notifications
        </Link>
      }
    >
      <div>
        <Row label="Order updates" enabled={notificationSettings.orderUpdates} />
        <Row label="Marketing emails" enabled={notificationSettings.marketing} />
        <Row label="SMS" enabled={notificationSettings.sms} />
      </div>
    </SectionCard>
  );
}

export default memo(NotificationsWidget);
