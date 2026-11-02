// Pure calculation engine — no DB access, no framework imports. Every
// caller (cart preview, checkout's live method list, order repricing) goes
// through calculateShipping()/getAvailableShippingMethods() here, so this
// is the one place shipping-cost math lives; swapping in a real DHL/UPS/
// FedEx rate lookup later means changing this file's internals only, not
// any of its callers.

export type ShippingMethodId = "standard" | "express" | "pickup";

export interface ShippingSettings {
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

export interface ShippingQuoteInput {
  subtotal: number;
  country?: string;
  state?: string;
  city?: string;
}

export interface ShippingMethodQuote {
  id: ShippingMethodId;
  label: string;
  description: string;
  cost: number;
  available: boolean;
  estimatedDelivery: string;
}

interface ShippingMethodMeta { id: ShippingMethodId; label: string; description: string }

// express/pickup keep their own fixed description — only "standard"'s is
// admin-configurable (the one "Estimated delivery text" field this task asks for).
const SHIPPING_METHODS: ShippingMethodMeta[] = [
  { id: "standard", label: "Standard Delivery", description: "" },
  { id: "express", label: "Express Delivery", description: "1–2 working days" },
  { id: "pickup", label: "Collect in Atelier", description: "Ready within 24 hours" },
];

// Standard delivery is priced off destination alone: 30 to any European
// country, 40 anywhere else. Express/pickup are unaffected — those still
// come from settings.expressRate / free.
const EUROPEAN_STANDARD_RATE = 30;
const REST_OF_WORLD_STANDARD_RATE = 40;

const EUROPEAN_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
  "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta",
  "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia",
  "Spain", "Sweden", "Norway", "Switzerland", "Iceland", "United Kingdom",
];

function isEuropeanCountry(country?: string): boolean {
  if (!country) return false;
  const target = country.trim().toLowerCase();
  return EUROPEAN_COUNTRIES.some((c) => c.toLowerCase() === target);
}

export function isInternational(settings: ShippingSettings, country?: string): boolean {
  if (!country || !settings.originCountry) return false;
  return country.trim().toLowerCase() !== settings.originCountry.trim().toLowerCase();
}

export function calculateShipping(
  input: ShippingQuoteInput,
  settings: ShippingSettings,
  method: ShippingMethodId = "standard"
): ShippingMethodQuote {
  const meta = SHIPPING_METHODS.find((m) => m.id === method) ?? SHIPPING_METHODS[0];
  const international = isInternational(settings, input.country);
  const blockedByInternational = international && !settings.internationalShippingEnabled;
  const blockedByPickup = method === "pickup" && !settings.localPickupEnabled;
  const available = !blockedByInternational && !blockedByPickup;

  let cost = 0;
  if (input.subtotal > 0) {
    if (method === "pickup") cost = 0;
    else if (method === "express") cost = settings.expressRate;
    else cost = isEuropeanCountry(input.country) ? EUROPEAN_STANDARD_RATE : REST_OF_WORLD_STANDARD_RATE;
  }

  return {
    id: method,
    label: meta.label,
    description: method === "standard" ? settings.estimatedDeliveryText : meta.description,
    cost: available ? cost : 0,
    available,
    estimatedDelivery: method === "standard" ? settings.estimatedDeliveryText : meta.description,
  };
}

// The full list of methods currently sellable for this input — what the
// checkout method selector actually offers (pickup omitted if disabled,
// standard/express omitted if this is a blocked international destination).
export function getAvailableShippingMethods(input: ShippingQuoteInput, settings: ShippingSettings): ShippingMethodQuote[] {
  return SHIPPING_METHODS
    .map((m) => calculateShipping(input, settings, m.id))
    .filter((q) => q.available);
}
