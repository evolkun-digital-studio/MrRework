"use client";
import { useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";
import { SectionCard, Toggle, Banner } from "@/components/account/ui";

const OPTIONS = [
  { key: "orderUpdates" as const, label: "Order updates", description: "Shipping confirmations, delivery updates and delays." },
  { key: "email" as const, label: "Email notifications", description: "General account activity sent to your email." },
  { key: "sms" as const, label: "SMS notifications", description: "Text messages for time-sensitive updates." },
  { key: "newsletter" as const, label: "Newsletter", description: "Occasional stories from the atelier." },
  { key: "marketing" as const, label: "Marketing emails", description: "Offers, new arrivals and promotions." },
];

export default function NotificationsPage() {
  const { account, setAccount } = useAccount();
  const [settings, setSettings] = useState(account.notificationSettings);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function toggle(key: keyof typeof settings, value: boolean) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaving(key);
    setMessage("");
    try {
      const res = await fetch("/api/account/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setSettings(data);
      setAccount({ ...account, notificationSettings: data });
    } catch {
      setSettings(settings); // revert
      setMessage("Could not save that preference — please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <SectionCard title="Notification preferences" description="Choose what you'd like to hear from us.">
      <div>
        {OPTIONS.map((o) => (
          <Toggle
            key={o.key} label={o.label} description={o.description}
            checked={settings[o.key]} disabled={saving === o.key}
            onChange={(v) => toggle(o.key, v)}
          />
        ))}
      </div>
      {message && <div className="mt-5"><Banner tone="error">{message}</Banner></div>}
    </SectionCard>
  );
}
