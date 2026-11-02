import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { StoreSettingsModel } from "@/models/StoreSettings";
import type { ShippingSettings } from "./shippingCalculator";

async function getOrCreateStoreSettings() {
  let settings = await StoreSettingsModel.findOne();
  if (!settings) settings = await StoreSettingsModel.create({});
  return settings;
}

export async function getShippingSettingsDoc() {
  await dbConnect();
  return getOrCreateStoreSettings();
}

// Flattens the reused top-level fields (shippingFlatRate,
// shippingExpressRate — already on StoreSettings before this feature
// existed) together with the new `shipping.*` sub-object into the one
// shape shippingCalculator.ts's pure functions expect.
export function getShippingSettings(settings: any): ShippingSettings {
  const s = settings.shipping ?? {};
  return {
    flatRate: settings.shippingFlatRate ?? 12,
    expressRate: settings.shippingExpressRate ?? 25,
    localPickupEnabled: s.localPickupEnabled ?? true,
    internationalShippingEnabled: s.internationalShippingEnabled ?? true,
    estimatedDeliveryText: s.estimatedDeliveryText ?? "7-12 working days",
    returnPolicyText: s.returnPolicyText ?? "Free returns within 30 days, unworn with tags attached. Refunds processed within 5 working days of receipt.",
    processingTimeText: s.processingTimeText ?? "Dispatched within 3-5 working days.",
    originCountry: s.originCountry ?? "",
    originState: s.originState ?? "",
    originCity: s.originCity ?? "",
  };
}

export interface ShippingSettingsPatch {
  flatRate?: number;
  expressRate?: number;
  localPickupEnabled?: boolean;
  internationalShippingEnabled?: boolean;
  estimatedDeliveryText?: string;
  returnPolicyText?: string;
  processingTimeText?: string;
  originCountry?: string;
  originState?: string;
  originCity?: string;
}

// Writes both the reused top-level fields and the new `shipping.*` object
// from one flattened admin-submitted patch.
export async function saveShippingSettings(patch: ShippingSettingsPatch) {
  const settings = await getOrCreateStoreSettings();
  if (!settings.shipping) settings.shipping = {};

  if (patch.flatRate !== undefined) settings.shippingFlatRate = patch.flatRate;
  if (patch.expressRate !== undefined) settings.shippingExpressRate = patch.expressRate;

  if (patch.localPickupEnabled !== undefined) settings.shipping.localPickupEnabled = patch.localPickupEnabled;
  if (patch.internationalShippingEnabled !== undefined) settings.shipping.internationalShippingEnabled = patch.internationalShippingEnabled;
  if (patch.estimatedDeliveryText !== undefined) settings.shipping.estimatedDeliveryText = patch.estimatedDeliveryText;
  if (patch.returnPolicyText !== undefined) settings.shipping.returnPolicyText = patch.returnPolicyText;
  if (patch.processingTimeText !== undefined) settings.shipping.processingTimeText = patch.processingTimeText;
  if (patch.originCountry !== undefined) settings.shipping.originCountry = patch.originCountry;
  if (patch.originState !== undefined) settings.shipping.originState = patch.originState;
  if (patch.originCity !== undefined) settings.shipping.originCity = patch.originCity;

  await settings.save();
  return settings;
}
