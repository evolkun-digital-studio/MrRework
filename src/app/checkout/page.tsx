"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import type { CountryCode } from "libphonenumber-js/min";
import { useCart } from "@/lib/store";
import { requireCustomerAuth } from "@/lib/customerAuthStore";
import { formatConvertedPrice } from "@/lib/utils";
import { calcTax, getShippingOptions, type ShippingMethod, type ShippingOption } from "@/lib/pricing";
import { DEFAULT_PHONE_COUNTRY, isPhoneValid, toE164 } from "@/lib/phoneValidation";
import { isEmailValid } from "@/lib/emailValidation";
import { useAddressAutofill } from "@/lib/useAddressAutofill";
import { findCountryByIso } from "@/lib/geoData";
import OrderSummary from "@/components/checkout/OrderSummary";
import PhoneField from "@/components/checkout/PhoneField";
import EmailField from "@/components/checkout/EmailField";
import SearchableSelect from "@/components/checkout/SearchableSelect";

interface PaypalConfig { enabled: boolean; clientId: string; currency: string }

interface FormState {
  email: string; newsletter: boolean;
  firstName: string; lastName: string; country: string; state: string;
  city: string; address: string; apartment: string; postalCode: string;
  phone: string; phoneCountry: CountryCode;
}

const emptyForm: FormState = {
  email: "", newsletter: false,
  firstName: "", lastName: "", country: "", state: "",
  city: "", address: "", apartment: "", postalCode: "",
  phone: "", phoneCountry: DEFAULT_PHONE_COUNTRY,
};

const REQUIRED: (keyof FormState)[] = ["email", "firstName", "lastName", "country", "city", "address", "postalCode", "phone"];

export default function CheckoutPage() {
  const router = useRouter();
  const { items: storeItems, clear } = useCart();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [coupon, setCoupon] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  // Set only once "Apply" is clicked (not on every keystroke) — the code
  // actually sent to /api/promotions/calculate and, on submit, to the
  // order. Clearing the field and clicking Apply again removes it.
  const [appliedCode, setAppliedCode] = useState<string | undefined>(undefined);
  const [promo, setPromo] = useState<{ totalSavings: number; freeShippingApplied: boolean; appliedDiscounts: { code?: string; description: string; amountSaved: number }[]; codeError?: string } | null>(null);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // One key per checkout attempt, sent with every order-creation request —
  // lets orderCreation.ts collapse a double-click, a retried fetch after a
  // client-side timeout, or two tabs into the same order instead of two.
  // Deliberately NOT regenerated on a failed-submit retry (see
  // createPaypalOrder()), so a genuine retry of the same attempt reuses the
  // same key.
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
  const [ready, setReady] = useState(false);
  const [paypalConfig, setPaypalConfig] = useState<PaypalConfig | null>(null);

  useEffect(() => {
    fetch("/api/payments/paypal/config")
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load PayPal config (${res.status}).`);
        return res.json();
      })
      .then(setPaypalConfig)
      .catch((err) => {
        console.error("[checkout] PayPal config fetch failed:", err instanceof Error ? err.message : err);
        setPaypalConfig({ enabled: false, clientId: "", currency: "GBP" });
      });
  }, []);

  // The persisted cart store always renders empty on the server (no
  // localStorage there). Reading it directly during the first client render
  // — before this effect flips `ready` — can disagree with that empty SSR
  // output once localStorage rehydrates, which React reports as a hydration
  // mismatch. Keep the displayed cart empty until mounted so both passes agree.
  useEffect(() => setReady(true), []);
  const items = ready ? storeItems : [];
  const subtotal = items.reduce((n, i) => n + i.price * i.quantity, 0);

  // Live, admin-configured shipping methods for this subtotal/destination —
  // fetched from POST /api/shipping/calculate, the same
  // src/lib/shipping/shippingCalculator.ts function
  // src/lib/orderCreation.ts uses server-side for the authoritative charge,
  // so checkout never shows a number the order could later disagree with.
  const [shippingOptions, setShippingOptions] = useState<(ShippingOption & { price: number })[]>(getShippingOptions(0));
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetch("/api/shipping/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtotal, country: form.country || undefined }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Shipping calculation failed (${res.status}).`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        // An empty array is a legitimate result (this destination is
        // genuinely unserved, e.g. international shipping disabled) — only
        // a malformed/missing response should fall back to the static
        // defaults, never an intentionally-empty one.
        if (Array.isArray(data.methods)) {
          setShippingOptions(data.methods.map((m: any) => ({ id: m.id, label: m.label, description: m.description, price: m.cost })));
        } else {
          setShippingOptions(getShippingOptions(subtotal));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[checkout] Shipping calculate fetch failed:", err instanceof Error ? err.message : err);
        setShippingOptions(getShippingOptions(subtotal));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, subtotal, form.country]);

  // No method selector in this checkout — "standard" is the only rate ever
  // charged, so its live price (30/40 GBP by destination, see
  // shippingCalculator.ts) is what's shown and charged.
  const rawShipping = shippingOptions.find((o) => o.id === "standard")?.price ?? 0;
  // Live discount preview — the same POST /api/promotions/calculate
  // src/lib/orderCreation.ts calls in-process for the final charge, so
  // checkout never shows savings the order could later disagree with.
  // Automatic discounts are recalculated on every relevant cart change
  // regardless of `appliedCode`; a manually-entered code is only sent once
  // "Apply" has actually been clicked.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const cartLines = storeItems.map((i) => ({ productId: i.id, price: i.price, quantity: i.quantity }));
    fetch("/api/promotions/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cartLines, subtotal, shipping: rawShipping, code: appliedCode }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Promotion calculation failed (${res.status}).`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setPromo(data);
        if (appliedCode) {
          // A code can pass validation yet still not make it into the final
          // applied set — it loses the stacking/priority resolution against
          // a higher-priority, non-stackable discount (e.g. an automatic
          // promotion already active). That's not a validation error, so
          // `codeError` is unset, but telling the customer "applied" would
          // be wrong: the savings shown come from the other discount, not
          // their code.
          const actuallyApplied = (data.appliedDiscounts ?? []).some((d: { code?: string }) => d.code === appliedCode);
          setCouponMessage(
            data.codeError
              ? data.codeError
              : actuallyApplied
                ? `"${appliedCode}" applied.`
                : `"${appliedCode}" can't be combined with a promotion already applied to your order.`
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[checkout] Promotion calculate fetch failed:", err instanceof Error ? err.message : err);
        setPromo(null);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, subtotal, rawShipping, appliedCode, storeItems.length]);

  const tax = calcTax(subtotal);
  const discount = promo?.totalSavings ?? 0;
  const shipping = promo?.freeShippingApplied ? 0 : rawShipping;
  const totals = ready
    ? { itemCount: items.reduce((n, i) => n + i.quantity, 0), subtotal, shipping, tax, discount, total: Math.max(0, subtotal + shipping + tax - discount) }
    : { itemCount: 0, subtotal: 0, shipping: 0, tax: 0, discount: 0, total: 0 };
  const shippingLabel = "Shipping";

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: false }));
  }

  const address = useAddressAutofill(
    { country: form.country, state: form.state, city: form.city, postalCode: form.postalCode },
    (field, value) => update(field, value)
  );

  // Everything charged (PayPal, the order total) stays GBP — this only
  // changes what the summary displays once the selected country resolves to
  // a different currency, converted at a live GBP-> rate (Frankfurter/ECB,
  // via /api/currency/rate). Falls back to GBP 1:1 if the country has no
  // resolved ISO code yet, already uses GBP, or the rate lookup fails.
  const [displayCurrency, setDisplayCurrency] = useState({ code: "GBP", rate: 1 });
  useEffect(() => {
    const code = address.countryIso ? findCountryByIso(address.countryIso)?.currency : undefined;
    if (!code || code === "GBP") { setDisplayCurrency({ code: "GBP", rate: 1 }); return; }
    let cancelled = false;
    fetch(`/api/currency/rate?currency=${code}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Currency rate lookup failed (${res.status}).`);
        return res.json();
      })
      .then((data) => { if (!cancelled) setDisplayCurrency({ code: data.currency ?? "GBP", rate: Number(data.rate) || 1 }); })
      .catch((err) => {
        if (cancelled) return;
        console.error("[checkout] Currency rate fetch failed:", err instanceof Error ? err.message : err);
        setDisplayCurrency({ code: "GBP", rate: 1 });
      });
    return () => { cancelled = true; };
  }, [address.countryIso]);

  // Also how a coupon is removed: clear the field, click Apply again.
  function applyCoupon() {
    if (!requireCustomerAuth()) return;
    const trimmed = coupon.trim();
    if (!trimmed) {
      const hadCode = !!appliedCode;
      setAppliedCode(undefined);
      setCouponMessage(hadCode ? "Coupon removed." : "");
      return;
    }
    setAppliedCode(trimmed);
  }

  // Called from the PayPal Buttons' createOrder callback before any payment
  // attempt starts. Returns false (and sets the same error UI used today)
  // instead of throwing, so the caller decides how to react.
  function validateRequiredFields(): boolean {
    setSubmitError("");
    if (storeItems.length === 0) { setSubmitError("Your bag is empty."); return false; }

    const missing = REQUIRED.filter((k) => !String(form[k]).trim());
    if (missing.length) {
      setErrors(Object.fromEntries(missing.map((k) => [k, true])));
      setSubmitError("Please fill in all required fields.");
      return false;
    }

    // Mirrors EmailField's own real-time check — required here too since a
    // customer can dismiss/ignore that inline feedback and still hit submit.
    if (!isEmailValid(form.email)) {
      setErrors((e) => ({ ...e, email: true }));
      setSubmitError("Wrong email entered. Please enter a valid email address.");
      return false;
    }

    // Presence alone isn't enough for phone — a filled-in but incomplete or
    // malformed number (wrong digit count for the selected country, letters,
    // etc.) would otherwise reach the order untouched. Checked separately
    // from REQUIRED since it's a format check, not a blank-field check.
    if (!isPhoneValid(form.phone, form.phoneCountry)) {
      setErrors((e) => ({ ...e, phone: true }));
      setSubmitError("Please enter a valid phone number.");
      return false;
    }

    return true;
  }

  function buildOrderPayload() {
    return {
      email: form.email,
      items: storeItems.map((i) => ({ productId: i.id, size: i.size, color: i.color, quantity: i.quantity })),
      shippingAddress: {
        firstName: form.firstName, lastName: form.lastName, country: form.country,
        state: form.state, city: form.city, address: form.address, apartment: form.apartment,
        postalCode: form.postalCode,
        // E.164 (e.g. "+447911123456") — validated above, so this is never
        // null in practice; the raw field is a harmless last-resort fallback.
        phone: toE164(form.phone, form.phoneCountry) ?? form.phone,
      },
      
      coupon: appliedCode,
      idempotencyKey,
    };
  }

  // createOrder for @paypal/react-paypal-js — called when the customer
  // clicks the PayPal button, before the popup opens. Returning a rejected
  // promise (rather than a resolved one) keeps the popup from opening at all
  // when the address form isn't valid yet.
  async function createPaypalOrder(): Promise<string> {
    if (!requireCustomerAuth()) throw new Error("Please log in to check out.");
    if (!validateRequiredFields()) throw new Error("Please fill in all required fields.");
    const res = await fetch("/api/payments/paypal/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildOrderPayload()),
    });
    const data = await res.json();
    if (!res.ok) { setSubmitError(data.error || "Could not start the PayPal payment."); throw new Error(data.error); }
    return data.paypalOrderId;
  }

  // onApprove — the customer has approved payment in the PayPal popup.
  // The Order only ever becomes "paid" once this server call verifies the
  // capture itself; nothing from the client is trusted for that decision.
  async function onApprovePaypal(data: { orderID: string }) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paypalOrderId: data.orderID }),
      });
      const result = await res.json();
      if (!res.ok || result.paymentStatus !== "paid") throw new Error(result.error || "Payment could not be verified.");

      clear();
      router.push(`/checkout/success?order=${result.orderNumber}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (ready && items.length === 0) {
    return (
      <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]">
        <h1 className="display mb-6" style={{ fontSize: "clamp(34px,5.5vw,76px)" }}>Checkout</h1>
        <p className="text-stone mb-6">Your bag is empty — add something before checking out.</p>
        <Link href="/shop" className="btn"><span>Continue shopping</span></Link>
      </div>
    );
  }

  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]">
      <h1 className="display mb-8" style={{ fontSize: "clamp(34px,5.5vw,76px)" }}>Checkout</h1>

      {/* mobile collapsible order summary */}
      <div className="lg:hidden mb-8 border border-line rounded-brand">
        <button
          type="button" onClick={() => setMobileSummaryOpen((o) => !o)} aria-expanded={mobileSummaryOpen}
          className="w-full flex items-center justify-between px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink rounded-brand"
        >
          <span className="text-[13px] font-medium">{mobileSummaryOpen ? "Hide" : "Show"} order summary · {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"}</span>
          <span className="flex items-center gap-2 font-mono text-[14px]">
            {formatConvertedPrice(totals.total, displayCurrency.code, displayCurrency.rate)}
            <ChevronDown size={16} className={`transition-transform ${mobileSummaryOpen ? "rotate-180" : ""}`} />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {mobileSummaryOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }} className="overflow-hidden"
            >
              <div className="px-5 pb-5 border-t border-line pt-5">
                <OrderSummary
                  items={items} totals={totals} shippingLabel={shippingLabel}
                  coupon={coupon} onCouponChange={setCoupon} onApplyCoupon={applyCoupon} couponMessage={couponMessage}
                  displayCurrency={displayCurrency.code} exchangeRate={displayCurrency.rate}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="grid lg:grid-cols-2 gap-12">
        <div className="max-w-[520px] lg:max-w-none space-y-9">
          <section>
            <h2 className="eyebrow mb-4">Contact information</h2>
            <EmailField value={form.email} onChange={(v) => update("email", v)} error={errors.email} />
            <label className="flex items-center gap-2.5 mt-4 text-[13px] text-ink-2 cursor-pointer">
              <input
                type="checkbox" checked={form.newsletter}
                onChange={(e) => update("newsletter", e.target.checked)}
                className="w-4 h-4 accent-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              />
              Email me with news and exclusive offers
            </label>
          </section>

          <section>
            <h2 className="eyebrow mb-4">Delivery</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SearchableSelect
                label="Country" value={form.country} options={address.countryOptions}
                onChange={address.changeCountry} onSelect={address.selectCountry}
                error={errors.country} autoComplete="country-name"
              />
              <PhoneField
                country={form.phoneCountry} value={form.phone} error={errors.phone}
                onCountryChange={(c) => update("phoneCountry", c)}
                onChange={(v) => update("phone", v)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="First name" value={form.firstName} onChange={(v) => update("firstName", v)} error={errors.firstName} autoComplete="given-name" />
              <Field label="Last name" value={form.lastName} onChange={(v) => update("lastName", v)} error={errors.lastName} autoComplete="family-name" />
            </div>
            <div className="mt-3"><Field label="Address" value={form.address} onChange={(v) => update("address", v)} error={errors.address} autoComplete="address-line1" /></div>
            <div className="mt-3"><Field label="Apartment, suite, etc. (optional)" value={form.apartment} onChange={(v) => update("apartment", v)} autoComplete="address-line2" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <SearchableSelect
                label="City" value={form.city} options={address.cityOptions}
                onChange={address.changeCity} error={errors.city} autoComplete="address-level2"
                disabled={!form.state.trim()} helperText={!form.state.trim() ? "Select a state first" : undefined}
              />
              <label className="block" htmlFor="field-postal-code">
                <span className="text-[11px] uppercase tracking-wide text-stone">Postal code</span>
                <div className="relative mt-1.5">
                  <input
                    id="field-postal-code"
                    value={form.postalCode}
                    onChange={(e) => address.changePostalCode(e.target.value)}
                    disabled={!form.country.trim()}
                    autoComplete="postal-code"
                    aria-invalid={errors.postalCode || !!address.lookupError}
                    placeholder={form.country.trim() ? undefined : "Select a country first"}
                    className={`w-full bg-white border rounded-2xl pl-4 pr-9 py-3.5 text-[14px] outline-none transition-all placeholder:text-stone disabled:bg-stone/5 disabled:cursor-not-allowed ${
                      errors.postalCode || address.lookupError
                        ? "border-ink"
                        : "border-line focus:border-ink focus:ring-2 focus:ring-ink/10"
                    }`}
                  />
                  {address.loading && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-stone">
                      <Loader2 size={15} className="animate-spin" />
                    </span>
                  )}
                </div>
              </label>
            </div>
            {address.lookupError && (
              <p role="alert" className="mt-2 text-[12px] text-red-500">{address.lookupError}</p>
            )}
            <div className="mt-3">
              <SearchableSelect
                label="State / region (optional)" value={form.state} options={address.stateOptions}
                onChange={address.changeState} onSelect={address.selectState} autoComplete="address-level1"
                disabled={!form.country.trim()} helperText={!form.country.trim() ? "Select a country first" : undefined}
              />
            </div>
          </section>

    

          <section>
            <h2 className="eyebrow mb-4">Payment</h2>
            {/* PayPal is the only checkout payment method — no selector/radio
                group needed since there's nothing to choose between. */}
            <div className="flex items-center gap-3.5 border border-ink rounded-brand px-4 py-3.5">
              <span className="flex-1 text-[14px] font-medium">PayPal</span>
            </div>
          </section>

          {submitError && <p role="alert" className="text-[13px] text-stone border border-line rounded-brand px-4 py-3">{submitError}</p>}

          {paypalConfig?.enabled ? (
            <PayPalScriptProvider options={{ clientId: paypalConfig.clientId, currency: paypalConfig.currency, intent: "capture" }}>
              <PayPalButtons
                style={{ layout: "vertical" }}
                disabled={submitting}
                forceReRender={[totals.total, paypalConfig.clientId]}
                createOrder={createPaypalOrder}
                onApprove={onApprovePaypal}
                onCancel={() => setSubmitError("PayPal payment was cancelled.")}
                onError={() => setSubmitError("PayPal was unable to process this payment. Please try again.")}
              />
            </PayPalScriptProvider>
          ) : (
            <p role="alert" className="text-[13px] text-stone border border-line rounded-brand px-4 py-3.5">
              {paypalConfig === null
                ? "Loading payment options…"
                : "PayPal isn't currently available — please check back shortly or contact us to complete your order."}
            </p>
          )}
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-28 lg:self-start border border-line rounded-brand p-6 h-fit">
          <OrderSummary
            items={items} totals={totals} shippingLabel={shippingLabel}
            coupon={coupon} onCouponChange={setCoupon} onApplyCoupon={applyCoupon} couponMessage={couponMessage}
            displayCurrency={displayCurrency.code} exchangeRate={displayCurrency.rate}
          />
        </aside>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, error, type = "text", autoComplete,
}: { label: string; value: string; onChange: (v: string) => void; error?: boolean; type?: string; autoComplete?: string }) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[11px] uppercase tracking-wide text-stone">{label}</span>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} aria-invalid={error}
        className={`w-full mt-1.5 bg-white border rounded-2xl px-4 py-3.5 text-[14px] outline-none transition-all placeholder:text-stone ${error ? "border-ink" : "border-line focus:border-ink focus:ring-2 focus:ring-ink/10"}`}
      />
    </label>
  );
}
