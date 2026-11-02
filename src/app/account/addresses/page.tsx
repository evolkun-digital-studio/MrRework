"use client";
import { useEffect, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { Field, SectionCard, Banner } from "@/components/account/ui";

interface Address {
  _id: string; firstName: string; lastName: string; phone: string;
  country: string; state: string; city: string; address: string; apartment: string; postalCode: string;
  isDefaultShipping: boolean; isDefaultBilling: boolean;
}

const EMPTY = {
  firstName: "", lastName: "", phone: "", country: "", state: "",
  city: "", address: "", apartment: "", postalCode: "",
};

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // address _id, or "new"
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    fetch("/api/account/addresses").then((res) => res.json()).then((data) => setAddresses(data.items ?? []));
  }
  useEffect(load, []);

  function startAdd() {
    setForm(EMPTY);
    setError("");
    setEditing("new");
  }
  function startEdit(a: Address) {
    setForm({
      firstName: a.firstName, lastName: a.lastName, phone: a.phone, country: a.country,
      state: a.state, city: a.city, address: a.address, apartment: a.apartment, postalCode: a.postalCode,
    });
    setError("");
    setEditing(a._id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/account/addresses" : `/api/account/addresses/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save address.");
      setAddresses(data.items);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/account/addresses/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) setAddresses(data.items);
  }

  async function setDefault(id: string, key: "isDefaultShipping" | "isDefaultBilling") {
    const res = await fetch(`/api/account/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: true }),
    });
    const data = await res.json();
    if (res.ok) setAddresses(data.items);
  }

  if (addresses === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-32 rounded-brand bg-paper-2 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium">Address book</h2>
        {editing === null && (
          <button type="button" onClick={startAdd} className="btn btn-ghost !py-2 !px-4 text-[12px]">
            <Plus size={14} /> <span>Add address</span>
          </button>
        )}
      </div>

      {editing !== null && (
        <SectionCard title={editing === "new" ? "Add address" : "Edit address"}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="First name" value={form.firstName} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} autoComplete="given-name" />
              <Field label="Last name" value={form.lastName} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} autoComplete="family-name" />
            </div>
            <Field label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} type="tel" autoComplete="tel" />
            <Field label="Address line 1" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} autoComplete="address-line1" />
            <Field label="Address line 2 (optional)" value={form.apartment} onChange={(v) => setForm((f) => ({ ...f, apartment: v }))} autoComplete="address-line2" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} autoComplete="address-level2" />
              <Field label="Postal code" value={form.postalCode} onChange={(v) => setForm((f) => ({ ...f, postalCode: v }))} autoComplete="postal-code" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="State / region (optional)" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} autoComplete="address-level1" />
              <Field label="Country" value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} autoComplete="country-name" />
            </div>

            {error && <Banner tone="error">{error}</Banner>}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="btn disabled:opacity-50"><span>{saving ? "Saving…" : "Save address"}</span></button>
              <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost"><span>Cancel</span></button>
            </div>
          </form>
        </SectionCard>
      )}

      {addresses.length === 0 && editing === null && (
        <SectionCard title="No saved addresses">
          <div className="text-center py-6">
            <MapPin size={30} strokeWidth={1.2} className="text-stone mx-auto mb-4" />
            <p className="text-[12.5px] text-stone">Add an address to speed up checkout next time.</p>
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {addresses.map((a) => (
          <div key={a._id} className="border border-line rounded-brand p-5">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {a.isDefaultShipping && <span className="text-[9.5px] uppercase tracking-wide bg-ink text-paper rounded-full px-2.5 py-1">Default shipping</span>}
              {a.isDefaultBilling && <span className="text-[9.5px] uppercase tracking-wide bg-ink text-paper rounded-full px-2.5 py-1">Default billing</span>}
            </div>
            <p className="text-[13.5px] leading-relaxed">
              {a.firstName} {a.lastName}<br />
              {a.address}{a.apartment ? `, ${a.apartment}` : ""}<br />
              {a.city}{a.state ? `, ${a.state}` : ""} {a.postalCode}<br />
              {a.country}
              {a.phone && <><br />{a.phone}</>}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-[11px] uppercase tracking-wide">
              <button type="button" onClick={() => startEdit(a)} className="underline hover:text-stone transition">Edit</button>
              <button type="button" onClick={() => remove(a._id)} className="underline hover:text-stone transition">Delete</button>
              {!a.isDefaultShipping && <button type="button" onClick={() => setDefault(a._id, "isDefaultShipping")} className="underline hover:text-stone transition">Set default shipping</button>}
              {!a.isDefaultBilling && <button type="button" onClick={() => setDefault(a._id, "isDefaultBilling")} className="underline hover:text-stone transition">Set default billing</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
