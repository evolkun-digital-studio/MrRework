import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { StoreSettingsModel } from "@/models/StoreSettings";
import { encrypt, decrypt } from "@/lib/crypto";

export interface PaypalGatewaySettings {
  enabled: boolean;
  environment: "sandbox" | "live";
  clientId: string;
  clientSecretEncrypted: string;
  webhookId: string;
  merchantEmail: string;
  currency: string;
  lastVerifiedAt: Date | null;
  status: "not_configured" | "connected" | "error";
}

// A short, non-reversible placeholder returned to the admin UI in place of
// the real secret — never the secret itself, never enough to reconstruct it.
export function maskSecret(encrypted: string): string {
  if (!encrypted) return "";
  try {
    const plain = decrypt(encrypted);
    if (!plain) return "";
    return `••••${plain.slice(-4)}`;
  } catch {
    return "••••";
  }
}

// The single JSON shape both the settings GET/PATCH route and the
// connect/disconnect routes hand back to the admin UI — kept here (not
// duplicated per-route) so none of them drift on what a "connected"
// gateway looks like.
export function serializePaypalSettings(settings: any) {
  const gw = settings.paymentGateways?.paypal ?? {};
  return {
    enabled: !!gw.enabled,
    environment: gw.environment ?? "sandbox",
    clientId: gw.clientId ?? "",
    secretMasked: maskSecret(gw.clientSecretEncrypted ?? ""),
    hasSecret: !!gw.clientSecretEncrypted,
    webhookId: gw.webhookId ?? "",
    merchantId: gw.merchantId ?? "",
    merchantEmail: gw.merchantEmail ?? "",
    currency: gw.currency ?? "GBP",
    lastVerifiedAt: gw.lastVerifiedAt ?? null,
    status: gw.status ?? "not_configured",
    connected: gw.status === "connected",
  };
}

async function getOrCreateStoreSettings() {
  let settings = await StoreSettingsModel.findOne();
  if (!settings) settings = await StoreSettingsModel.create({});
  return settings;
}

export async function getPaypalSettingsDoc() {
  await dbConnect();
  return getOrCreateStoreSettings();
}

export function getPaypalCredentials(gw: PaypalGatewaySettings) {
  return {
    clientId: gw.clientId,
    clientSecret: gw.clientSecretEncrypted ? decrypt(gw.clientSecretEncrypted) : "",
    environment: gw.environment,
  };
}

export interface PaypalSettingsPatch {
  enabled?: boolean;
  environment?: "sandbox" | "live";
  clientId?: string;
  clientSecret?: string; // plaintext, only present when the admin is setting a new one
  webhookId?: string;
  merchantEmail?: string;
  currency?: string;
}

// Applies an admin-submitted patch to the stored PayPal settings. A blank/
// omitted `clientSecret` means "keep the existing one" — the admin UI never
// round-trips the real secret, so there's nothing else it could mean.
//
// Mutates the nested `paymentGateways.paypal` path directly rather than
// reassigning `settings.paymentGateways` from a spread — a StoreSettings
// document created before this field existed has no `paymentGateways` at
// all yet, and spreading a Mongoose subdocument (`{ ...settings.paymentGateways }`)
// only copies its own enumerable properties, which silently produced `{}`
// and made Mongoose reject the save with "Cast to Object failed ... at path
// paymentGateways.paypal". Explicitly seeding both levels first, then
// assigning leaf fields, is what Mongoose's own change-tracking expects.
export async function savePaypalSettings(patch: PaypalSettingsPatch) {
  const settings = await getOrCreateStoreSettings();
  if (!settings.paymentGateways) settings.paymentGateways = {};
  if (!settings.paymentGateways.paypal) settings.paymentGateways.paypal = {};
  const gw = settings.paymentGateways.paypal;

  if (patch.enabled !== undefined) gw.enabled = patch.enabled;
  if (patch.environment !== undefined) gw.environment = patch.environment;
  if (patch.clientId !== undefined) gw.clientId = patch.clientId;
  if (patch.webhookId !== undefined) gw.webhookId = patch.webhookId;
  if (patch.merchantEmail !== undefined) gw.merchantEmail = patch.merchantEmail;
  if (patch.currency !== undefined) gw.currency = patch.currency;
  if (typeof patch.clientSecret === "string" && patch.clientSecret.trim()) {
    gw.clientSecretEncrypted = encrypt(patch.clientSecret.trim());
  }

  await settings.save();
  return settings;
}

export async function setPaypalConnectionStatus(status: "connected" | "error", verifiedAt: Date) {
  const settings = await getOrCreateStoreSettings();
  if (!settings.paymentGateways) settings.paymentGateways = {};
  if (!settings.paymentGateways.paypal) settings.paymentGateways.paypal = {};
  settings.paymentGateways.paypal.status = status;
  settings.paymentGateways.paypal.lastVerifiedAt = verifiedAt;
  await settings.save();
  return settings;
}

export interface ConnectPaypalInput {
  clientId: string;
  clientSecret: string; // plaintext — encrypted here, never stored as-is
  merchantId: string;
  merchantEmail: string;
  environment: "sandbox" | "live";
}

// Persists a successful manual "Connect PayPal" — called only after the
// entered Client ID/Secret have themselves authenticated against PayPal
// (see the connect route). Writes the exact fields checkout, order
// creation, capture and the webhook already read via
// getPaypalCredentials()/gw.enabled — connecting is what actually turns
// checkout on, the same as manually saving+enabling credentials always did.
export async function saveConnectedPaypalCredentials(input: ConnectPaypalInput) {
  const settings = await getOrCreateStoreSettings();
  if (!settings.paymentGateways) settings.paymentGateways = {};
  if (!settings.paymentGateways.paypal) settings.paymentGateways.paypal = {};
  const gw = settings.paymentGateways.paypal;

  gw.clientId = input.clientId;
  gw.clientSecretEncrypted = encrypt(input.clientSecret);
  gw.merchantId = input.merchantId;
  gw.merchantEmail = input.merchantEmail;
  gw.environment = input.environment;
  gw.enabled = true;
  gw.status = "connected";
  gw.lastVerifiedAt = new Date();

  await settings.save();
  return settings;
}

// Reverses saveConnectedPaypalCredentials — clears the stored credentials
// and disables the gateway, returning the admin UI to the editable
// Client ID/Secret/Merchant ID form.
export async function disconnectPaypal() {
  const settings = await getOrCreateStoreSettings();
  if (!settings.paymentGateways) settings.paymentGateways = {};
  if (!settings.paymentGateways.paypal) settings.paymentGateways.paypal = {};
  const gw = settings.paymentGateways.paypal;

  gw.clientId = "";
  gw.clientSecretEncrypted = "";
  gw.merchantId = "";
  gw.merchantEmail = "";
  gw.enabled = false;
  gw.status = "not_configured";

  await settings.save();
  return settings;
}
