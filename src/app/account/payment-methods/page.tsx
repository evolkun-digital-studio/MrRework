"use client";
import { useEffect, useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { SectionCard, Banner } from "@/components/account/ui";
import {
  formatCardNumber, formatExpiry, formatCvv,
  isCardNumberValid, isExpiryValid, isCvvValid,
} from "@/lib/cardValidation";

interface Card {
  _id: string; brand: string; last4: string; expMonth: number; expYear: number;
  holderName: string; isDefault: boolean;
}

function detectBrand(number: string): "visa" | "mastercard" | "amex" | "other" {
  const digits = number.replace(/\D/g, "");
  if (/^4/.test(digits)) return "visa";
  if (/^5[1-5]/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  return "other";
}

const BRAND_LABEL: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", other: "Card" };

export default function PaymentMethodsPage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/account/payment-methods").then((res) => res.json()).then((data) => setCards(data.items ?? []));
  }
  useEffect(load, []);

  function resetForm() {
    setNumber(""); setName(""); setExpiry(""); setCvv(""); setErrors({}); setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const issues: Record<string, boolean> = {
      number: !isCardNumberValid(number),
      name: !name.trim(),
      expiry: !isExpiryValid(expiry),
      cvv: !isCvvValid(cvv),
    };
    if (Object.values(issues).some(Boolean)) {
      setErrors(issues);
      setError("Please check your card details.");
      return;
    }

    const [expMonth, expYear] = expiry.split("/").map(Number);
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/account/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: detectBrand(number),
          last4: number.replace(/\D/g, "").slice(-4),
          expMonth, expYear: 2000 + expYear,
          holderName: name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save card.");
      setCards(data.items);
      setAdding(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/account/payment-methods/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) setCards(data.items);
  }

  async function setDefault(id: string) {
    const res = await fetch(`/api/account/payment-methods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const data = await res.json();
    if (res.ok) setCards(data.items);
  }

  if (cards === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 rounded-brand bg-paper-2 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium">Payment methods</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn btn-ghost !py-2 !px-4 text-[12px]">
            <Plus size={14} /> <span>Add card</span>
          </button>
        )}
      </div>

      <Banner>Card details are validated locally only — no live payment processor is connected in this environment. Only the last 4 digits are ever stored.</Banner>

      {adding && (
        <SectionCard title="Add card">
          <form onSubmit={submit} className="space-y-3">
            <CardField label="Card number" value={number} error={errors.number} onChange={(v) => { setNumber(formatCardNumber(v)); setErrors((e) => ({ ...e, number: false })); }} inputMode="numeric" placeholder="1234 5678 9012 3456" />
            <CardField label="Name on card" value={name} error={errors.name} onChange={(v) => { setName(v); setErrors((e) => ({ ...e, name: false })); }} placeholder="Jane Doe" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CardField label="Expiry (MM/YY)" value={expiry} error={errors.expiry} onChange={(v) => { setExpiry(formatExpiry(v)); setErrors((e) => ({ ...e, expiry: false })); }} inputMode="numeric" placeholder="MM/YY" />
              <CardField label="CVV" value={cvv} error={errors.cvv} onChange={(v) => { setCvv(formatCvv(v)); setErrors((e) => ({ ...e, cvv: false })); }} inputMode="numeric" placeholder="123" />
            </div>
            {error && <Banner tone="error">{error}</Banner>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="btn disabled:opacity-50"><span>{saving ? "Saving…" : "Save card"}</span></button>
              <button type="button" onClick={() => { setAdding(false); resetForm(); }} className="btn btn-ghost"><span>Cancel</span></button>
            </div>
          </form>
        </SectionCard>
      )}

      {cards.length === 0 && !adding && (
        <SectionCard title="No saved cards">
          <div className="text-center py-6">
            <CreditCard size={30} strokeWidth={1.2} className="text-stone mx-auto mb-4" />
            <p className="text-[12.5px] text-stone">Save a card to speed up checkout next time.</p>
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <div key={c._id} className="border border-line rounded-brand p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-2 text-[13.5px] font-medium"><CreditCard size={16} className="text-stone" /> {BRAND_LABEL[c.brand] ?? c.brand}</span>
              {c.isDefault && <span className="text-[9.5px] uppercase tracking-wide bg-ink text-paper rounded-full px-2.5 py-1">Default</span>}
            </div>
            <div className="font-mono text-[14px]">•••• •••• •••• {c.last4}</div>
            <div className="text-[12px] text-stone mt-1">{c.holderName} · Expires {String(c.expMonth).padStart(2, "0")}/{String(c.expYear).slice(-2)}</div>
            <div className="flex gap-4 mt-4 text-[11px] uppercase tracking-wide">
              {!c.isDefault && <button type="button" onClick={() => setDefault(c._id)} className="underline hover:text-stone transition">Set as default</button>}
              <button type="button" onClick={() => remove(c._id)} className="underline hover:text-stone transition">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardField({
  label, value, onChange, error, inputMode, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; error?: boolean; inputMode?: "numeric" | "text"; placeholder?: string }) {
  const id = `account-card-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[11px] uppercase tracking-wide text-stone">{label}</span>
      <input
        id={id} value={value} onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode} placeholder={placeholder} aria-invalid={error}
        className={`w-full mt-1.5 bg-transparent border rounded-brand px-3.5 py-2.5 text-[14px] outline-none transition placeholder:text-stone ${error ? "border-ink" : "border-line focus:border-ink"}`}
      />
    </label>
  );
}
