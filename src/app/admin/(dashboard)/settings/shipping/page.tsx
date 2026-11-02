"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, Input, Textarea, Button, Banner } from "@/components/admin/ui";

interface ShippingSettings {
  flatRate: number;
  expressRate: number;
  localPickupEnabled: boolean;
  internationalShippingEnabled: boolean;
  estimatedDeliveryText: string;
  returnPolicyText: string;
  processingTimeText: string;
  originCountry: string;
  originState: string;
  originCity: string;
}

export default function ShippingSettingsPage() {
  const [shipping, setShipping] = useState<ShippingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings/shipping")
      .then((res) => res.json())
      .then((data) => setShipping(data.shipping))
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!shipping) return;
    setSaving(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/admin/settings/shipping", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipping }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { setError(data?.error ?? "Could not save shipping settings."); return; }
    setShipping(data.shipping);
    setMessage("Shipping settings saved.");
  }

  if (!shipping) return <div className="h-64 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />;

  function update<K extends keyof ShippingSettings>(k: K, v: ShippingSettings[K]) {
    setShipping((s) => (s ? { ...s, [k]: v } : s));
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/settings" className="inline-flex items-center gap-1.5 text-[12.5px] text-stone hover:text-ink dark:hover:text-[#f3efe8] mb-2">
          <ArrowLeft size={14} /> Settings
        </Link>
        <h1 className="text-[20px] font-semibold">Shipping</h1>
        <p className="text-[12.5px] text-stone mt-1">Configure shipping globally — checkout, the cart, and product pages all read these live.</p>
      </div>

      <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Rates">
          <div className="space-y-3">
            <Input label="Flat rate" type="number" min={0} step="0.01" value={shipping.flatRate} onChange={(e) => update("flatRate", Number(e.target.value))} />
            <Input label="Express rate" type="number" min={0} step="0.01" value={shipping.expressRate} onChange={(e) => update("expressRate", Number(e.target.value))} />

            <label className="flex items-center gap-2.5 text-[13px] cursor-pointer pt-1">
              <input type="checkbox" checked={shipping.localPickupEnabled} onChange={(e) => update("localPickupEnabled", e.target.checked)} className="w-4 h-4 accent-[var(--ink)]" />
              Enable local pickup
            </label>
            <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={shipping.internationalShippingEnabled} onChange={(e) => update("internationalShippingEnabled", e.target.checked)} className="w-4 h-4 accent-[var(--ink)]" />
              Enable international shipping
            </label>
          </div>
        </Card>

        <Card title="Customer-facing copy" description="Shown at checkout and on product pages.">
          <div className="space-y-3">
            <Input label="Estimated delivery text" value={shipping.estimatedDeliveryText} onChange={(e) => update("estimatedDeliveryText", e.target.value)} />
            <Input label="Processing time" value={shipping.processingTimeText} onChange={(e) => update("processingTimeText", e.target.value)} />
            <Textarea label="Return policy text" rows={3} value={shipping.returnPolicyText} onChange={(e) => update("returnPolicyText", e.target.value)} />
          </div>
        </Card>

        <Card title="Shipping origin" description="Used to determine whether a destination counts as international. Not shown to customers.">
          <div className="space-y-3">
            <Input label="Origin country" value={shipping.originCountry} onChange={(e) => update("originCountry", e.target.value)} placeholder="e.g. Belgium" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Origin state / region" value={shipping.originState} onChange={(e) => update("originState", e.target.value)} />
              <Input label="Origin city" value={shipping.originCity} onChange={(e) => update("originCity", e.target.value)} />
            </div>
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          {message && <Banner>{message}</Banner>}
          {error && <Banner tone="error">{error}</Banner>}
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save shipping settings"}</Button>
        </div>
      </form>
    </div>
  );
}
