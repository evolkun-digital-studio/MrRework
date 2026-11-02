"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/admin/ui";

interface PaypalStatus {
  enabled: boolean;
  status: "not_configured" | "connected" | "error";
}

const COMING_SOON = ["Stripe", "Razorpay", "Bank Transfer", "Cash on Delivery"];

function paypalBadge(paypal: PaypalStatus | null): { tone: "neutral" | "success" | "warning" | "danger"; label: string } {
  if (!paypal || !paypal.enabled) return { tone: "neutral", label: "Disabled" };
  if (paypal.status === "connected") return { tone: "success", label: "Connected" };
  if (paypal.status === "error") return { tone: "danger", label: "Connection error" };
  return { tone: "warning", label: "Enabled — not verified" };
}

export default function PaymentGatewaysHubPage() {
  const [paypal, setPaypal] = useState<PaypalStatus | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings/payment-gateways")
      .then((res) => res.json())
      .then((data) => setPaypal(data.paypal))
      .catch(() => {});
  }, []);

  const badge = paypalBadge(paypal);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Payment Gateways</h1>
        <p className="text-[12.5px] text-stone mt-1">Configure how customers pay at checkout.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/admin/settings/payment-gateways/paypal">
          <Card className="hover:border-ink dark:hover:border-[#f3efe8] transition cursor-pointer h-full">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium">PayPal</span>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>
            <p className="text-[12px] text-stone mt-2">Sandbox and Live checkout, credentials, and payment dashboard.</p>
          </Card>
        </Link>

        {COMING_SOON.map((label) => (
          <div key={label} aria-disabled="true">
            <Card className="opacity-50 cursor-not-allowed h-full">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium">{label}</span>
                <Badge tone="neutral">Coming soon</Badge>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
