"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Card, StatCard, Input, Button, Badge, Banner, Table, Th, Td } from "@/components/admin/ui";

interface PaypalSettings {
  enabled: boolean;
  environment: "sandbox" | "live";
  clientId: string;
  secretMasked: string;
  hasSecret: boolean;
  webhookId: string;
  merchantId: string;
  merchantEmail: string;
  currency: string;
  lastVerifiedAt: string | null;
  status: "not_configured" | "connected" | "error";
  connected: boolean;
}

interface Stats {
  totalOrders: number;
  totalPaid: number;
  lastPaymentAt: string | null;
  recentTransactions: { orderNumber: string; total: number; currency: string; paymentStatus: string; paidAt: string | null; createdAt: string }[];
}

const STATUS_TONE = { not_configured: "neutral", connected: "success", error: "danger" } as const;

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export default function PaypalSettingsPage() {
  const [paypal, setPaypal] = useState<PaypalSettings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function load() {
    fetch("/api/admin/settings/payment-gateways")
      .then((res) => res.json())
      .then((data) => { setPaypal(data.paypal); setStats(data.stats); })
      .catch(() => {});
  }

  useEffect(load, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/admin/settings/payment-gateways/paypal/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), merchantId: merchantId.trim() }),
    });
    const data = await res.json().catch(() => null);
    setConnecting(false);
    if (!res.ok) { setError(data?.error ?? "Could not connect to PayPal."); return; }
    setPaypal(data.paypal);
    setClientId("");
    setClientSecret("");
    setMerchantId("");
    setMessage("PayPal connected.");
  }

  async function disconnect() {
    if (!confirm("Disconnect PayPal? Checkout will stop accepting PayPal until you reconnect.")) return;
    setDisconnecting(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/admin/settings/payment-gateways/paypal/disconnect", { method: "POST" });
    const data = await res.json().catch(() => null);
    setDisconnecting(false);
    if (!res.ok) { setError(data?.error ?? "Could not disconnect."); return; }
    setPaypal(data.paypal);
    setMessage("PayPal disconnected.");
  }

  if (!paypal) return <div className="h-64 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/settings/payment-gateways" className="inline-flex items-center gap-1.5 text-[12.5px] text-stone hover:text-ink dark:hover:text-[#f3efe8] mb-2">
          <ArrowLeft size={14} /> Payment Gateways
        </Link>
        <h1 className="text-[20px] font-semibold">PayPal</h1>
        <p className="text-[12.5px] text-stone mt-1">Connect your PayPal business account to accept PayPal at checkout.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Connected" value={paypal.connected ? "Yes" : "No"} />
        <StatCard label="Mode" value={paypal.environment === "live" ? "Live" : "Sandbox"} />
        <StatCard label="Total PayPal Orders" value={stats?.totalOrders ?? 0} />
        <StatCard label="Last Payment" value={fmtDate(stats?.lastPaymentAt ?? null)} />
      </div>

      {message && <Banner>{message}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card
          title="PayPal Connection"
          description={
            paypal.connected
              ? "Manage your connected PayPal account."
              : "Enter your PayPal REST API Client ID and Secret to connect. Sandbox vs Live is detected automatically."
          }
        >
          {paypal.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[13px]">
                <CheckCircle2 size={16} className="text-[#1f3d2b] dark:text-[#7fbf9a]" />
                <span className="font-medium">Connected to PayPal</span>
                <Badge tone={STATUS_TONE[paypal.status]}>{paypal.status.replace("_", " ")}</Badge>
              </div>
              <dl className="text-[12.5px] space-y-1.5">
                <div className="flex justify-between gap-3">
                  <dt className="text-stone">Merchant ID</dt>
                  <dd className="font-mono">{paypal.merchantId || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone">Merchant email</dt>
                  <dd className="font-mono">{paypal.merchantEmail || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone">Environment</dt>
                  <dd className="capitalize">{paypal.environment}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone">Last verified</dt>
                  <dd>{fmtDate(paypal.lastVerifiedAt)}</dd>
                </div>
              </dl>
              <Button type="button" variant="danger" disabled={disconnecting} onClick={disconnect}>
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          ) : (
            <form onSubmit={connect} className="space-y-3 max-w-sm">
              <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" required />
              <Input
                label="Client Secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
                autoComplete="off" required
              />
              <Input label="Merchant ID (optional)" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} autoComplete="off" />
              <Button type="submit" disabled={connecting}>{connecting ? "Connecting…" : "Connect PayPal"}</Button>
            </form>
          )}
        </Card>

        <Card title="Recent Transactions">
          {stats?.recentTransactions.length ? (
            <Table>
              <thead><tr><Th>Order</Th><Th>Total</Th><Th>Status</Th><Th>Paid</Th></tr></thead>
              <tbody>
                {stats.recentTransactions.map((t) => (
                  <tr key={t.orderNumber}>
                    <Td className="font-mono text-[12px]">{t.orderNumber}</Td>
                    <Td className="font-mono">{t.total?.toFixed(2)} {t.currency}</Td>
                    <Td className="capitalize">{t.paymentStatus}</Td>
                    <Td>{fmtDate(t.paidAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-[12.5px] text-stone">No PayPal orders yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
