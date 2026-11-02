"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, Input, Textarea, Button, Banner } from "@/components/admin/ui";
import { useAdmin } from "@/components/admin/AdminProvider";

interface Settings {
  storeName: string; email: string; phone: string;
  address: { line1: string; city: string; state: string; postalCode: string; country: string };
  currency: string; taxRate: number;
  seoTitle: string; seoDescription: string;
  social: { instagram: string; facebook: string; twitter: string; pinterest: string };
}

export default function AdminSettingsPage() {
  const { admin } = useAdmin();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings").then((res) => res.json()).then((data) => setSettings(data.settings)).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    const data = await res.json();
    setSettings(data.settings);
    setMessage("Settings saved.");
    setSaving(false);
  }

  if (!settings) return <div className="h-64 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />;

  function update<K extends keyof Settings>(k: K, v: Settings[K]) { setSettings((s) => (s ? { ...s, [k]: v } : s)); }
  function updateAddress<K extends keyof Settings["address"]>(k: K, v: string) { setSettings((s) => (s ? { ...s, address: { ...s.address, [k]: v } } : s)); }
  function updateSocial<K extends keyof Settings["social"]>(k: K, v: string) { setSettings((s) => (s ? { ...s, social: { ...s.social, [k]: v } } : s)); }

  return (
    <form onSubmit={save} className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Settings</h1>
        <p className="text-[12.5px] text-stone mt-1">Store details, pricing defaults, SEO and social links.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Store details">
          <div className="space-y-3">
            <Input label="Store name" value={settings.storeName} onChange={(e) => update("storeName", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Email" type="email" value={settings.email} onChange={(e) => update("email", e.target.value)} />
              <Input label="Phone" value={settings.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <Input label="Address line" value={settings.address.line1} onChange={(e) => updateAddress("line1", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="City" value={settings.address.city} onChange={(e) => updateAddress("city", e.target.value)} />
              <Input label="State / region" value={settings.address.state} onChange={(e) => updateAddress("state", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Postal code" value={settings.address.postalCode} onChange={(e) => updateAddress("postalCode", e.target.value)} />
              <Input label="Country" value={settings.address.country} onChange={(e) => updateAddress("country", e.target.value)} />
            </div>
          </div>
        </Card>

        <Card title="Pricing defaults">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Currency" value={settings.currency} onChange={(e) => update("currency", e.target.value)} />
            <Input label="Tax rate (%)" type="number" step="0.1" value={settings.taxRate} onChange={(e) => update("taxRate", Number(e.target.value))} />
          </div>
        </Card>

        <Card title="SEO">
          <div className="space-y-3">
            <Input label="Default page title" value={settings.seoTitle} onChange={(e) => update("seoTitle", e.target.value)} />
            <Textarea label="Default meta description" rows={3} value={settings.seoDescription} onChange={(e) => update("seoDescription", e.target.value)} />
          </div>
        </Card>

        <Card title="Payment Gateways" description="PayPal and other checkout payment methods.">
          <Link href="/admin/settings/payment-gateways" className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-70">
            Manage payment gateways <ArrowRight size={14} />
          </Link>
        </Card>

        <Card title="Shipping" description="Rates, free-shipping threshold, local pickup, international shipping, and customer-facing delivery/return copy.">
          <Link href="/admin/settings/shipping" className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-70">
            Manage shipping settings <ArrowRight size={14} />
          </Link>
        </Card>

        {admin.adminRole === "parent" && (
          <Card title="Admin Management" description="Invite Child Admins, and enable, disable, delete, or reset the password for existing ones.">
            <Link href="/admin/settings/admin-management" className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-70">
              Manage admins <ArrowRight size={14} />
            </Link>
          </Card>
        )}

        {admin.adminRole === "parent" && (
          <Card title="Email Notifications" description="Choose which admins get emailed when a new customer registers.">
            <Link href="/admin/settings/notifications" className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-70">
              Manage notification settings <ArrowRight size={14} />
            </Link>
          </Card>
        )}

        <Card title="Social links">
          <div className="space-y-3">
            <Input label="Instagram" value={settings.social.instagram} onChange={(e) => updateSocial("instagram", e.target.value)} />
            <Input label="Facebook" value={settings.social.facebook} onChange={(e) => updateSocial("facebook", e.target.value)} />
            <Input label="Twitter / X" value={settings.social.twitter} onChange={(e) => updateSocial("twitter", e.target.value)} />
            <Input label="Pinterest" value={settings.social.pinterest} onChange={(e) => updateSocial("pinterest", e.target.value)} />
          </div>
        </Card>
      </div>

      {message && <Banner>{message}</Banner>}
      <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
    </form>
  );
}
