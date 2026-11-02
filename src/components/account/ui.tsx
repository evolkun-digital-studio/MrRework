"use client";

// Shared primitives for the account section — deliberately mirror the exact
// classes used by the checkout <Field> and toggle checkboxes elsewhere in
// the app (see src/app/checkout/page.tsx, src/app/wishlist/page.tsx) so this
// section looks native to the rest of the site rather than inventing a new
// visual language.

// Shape returned by GET /api/orders (see that route) — shared between the
// orders list page and the dashboard's summary/recent-orders widgets so
// neither drifts from the other or from the API's actual response.
export interface OrderSummary {
  orderNumber: string; createdAt: string; itemCount: number; total: number;
  paymentStatus: string; fulfillmentStatus: string;
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", paid: "Paid", failed: "Failed", refunded: "Refunded",
  unfulfilled: "Unfulfilled", processing: "Processing", shipped: "Shipped", delivered: "Delivered",
};

export function Field({
  label, value, onChange, error, type = "text", autoComplete, placeholder, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; error?: boolean;
  type?: string; autoComplete?: string; placeholder?: string; disabled?: boolean;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[11px] uppercase tracking-wide text-stone">{label}</span>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} aria-invalid={error} placeholder={placeholder} disabled={disabled}
        className={`w-full mt-1.5 bg-white border rounded-2xl px-4 py-3.5 text-[14px] outline-none transition-all placeholder:text-stone disabled:opacity-50 ${error ? "border-ink" : "border-line focus:border-ink focus:ring-2 focus:ring-ink/10"}`}
      />
    </label>
  );
}

export function SelectField({
  label, value, onChange, options, error,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; error?: boolean;
}) {
  const id = `select-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[11px] uppercase tracking-wide text-stone">{label}</span>
      <select
        id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error}
        className={`w-full mt-1.5 bg-white border rounded-2xl px-4 py-3.5 text-[14px] outline-none transition-all ${error ? "border-ink" : "border-line focus:border-ink focus:ring-2 focus:ring-ink/10"}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function Toggle({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 py-3.5 border-b border-line last:border-b-0 ${disabled ? "opacity-50 cursor-wait" : "cursor-pointer"}`}>
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        {description && <span className="block text-[12px] text-stone mt-0.5">{description}</span>}
      </span>
      <span className="relative shrink-0">
        <input
          type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <span className="block w-10 h-6 rounded-full bg-paper-2 border border-line transition-colors peer-checked:bg-ink peer-checked:border-ink" />
        <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-paper transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export function SectionCard({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border border-line rounded-brand p-5 md:p-8 bg-white shadow-[0_1px_10px_rgba(17,17,17,0.03)]">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[15px] font-medium">{title}</h2>
          {description && <p className="text-[12.5px] text-stone mt-1 max-w-[520px]">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Banner({ tone = "neutral", children }: { tone?: "neutral" | "error"; children: React.ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : undefined} className="text-[13px] text-ink border border-line rounded-brand px-4 py-3 bg-paper-2">
      {children}
    </p>
  );
}
