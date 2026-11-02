import "server-only";
import { Client, Environment, OrdersController, CheckoutPaymentIntent, type Order } from "@paypal/paypal-server-sdk";

export interface PaypalCredentials {
  clientId: string;
  clientSecret: string;
  environment: "sandbox" | "live";
}

export function baseUrl(environment: "sandbox" | "live"): string {
  return environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function buildClient({ clientId, clientSecret, environment }: PaypalCredentials): Client {
  return new Client({
    clientCredentialsAuthCredentials: { oAuthClientId: clientId, oAuthClientSecret: clientSecret },
    environment: environment === "live" ? Environment.Production : Environment.Sandbox,
  });
}

// Creates a PayPal Checkout order (v2/checkout/orders) via the official
// PayPal Server SDK's OrdersController — the primary create/capture path.
//
// `paypalRequestId` is PayPal's own idempotency key (PayPal-Request-Id
// header) — set to our Order's own _id, which is stable and known before
// this call. Without it, a network retry of this exact request (client
// timeout, proxy retry, etc.) that actually succeeded server-side at PayPal
// but lost its response would create a second, distinct PayPal order for
// the same cart on retry; with it, PayPal returns the original result
// instead of creating a duplicate.
export async function createPaypalOrder(
  creds: PaypalCredentials,
  opts: { total: number; currency: string; customId: string; invoiceId: string; requestId: string }
): Promise<Order> {
  const orders = new OrdersController(buildClient(creds));
  const { result } = await orders.createOrder({
    body: {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [
        {
          amount: { currencyCode: opts.currency, value: opts.total.toFixed(2) },
          customId: opts.customId,
          invoiceId: opts.invoiceId,
        },
      ],
    },
    paypalRequestId: opts.requestId,
  });
  return result;
}

// Same idempotency guarantee as above, keyed by the PayPal order id itself
// (unique per capture attempt) — a retried capture-order call for the same
// paypalOrderId returns the original capture result rather than PayPal
// treating it as a second, separate capture attempt.
export async function capturePaypalOrder(creds: PaypalCredentials, paypalOrderId: string): Promise<Order> {
  const orders = new OrdersController(buildClient(creds));
  const { result } = await orders.captureOrder({ id: paypalOrderId, paypalRequestId: paypalOrderId });
  return result;
}

// The installed SDK version (@paypal/paypal-server-sdk) only exposes
// Orders/Payments/Vault/Transaction-Search/Subscriptions controllers — no
// Webhooks controller — so OAuth token fetch and webhook signature
// verification below call PayPal's stable REST endpoints directly (the same
// ones the SDK's own OrdersController calls under the hood), rather than
// inventing a workaround around a controller that doesn't exist in this
// package version.
export async function fetchAccessToken(creds: PaypalCredentials): Promise<string> {
  const res = await fetch(`${baseUrl(creds.environment)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal authentication failed (HTTP ${res.status}).`);
  const data = await res.json();
  if (!data.access_token) throw new Error("PayPal authentication failed — no access token returned.");
  return data.access_token as string;
}

// Used by the admin "Test Connection" action — proves the stored
// credentials can authenticate against the selected PayPal environment.
// Never logs the credentials themselves, only the outcome.
export async function testPaypalConnection(creds: PaypalCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    await fetchAccessToken(creds);
    return { ok: true, message: `Connected to PayPal ${creds.environment === "live" ? "Live" : "Sandbox"}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed." };
  }
}

export interface MerchantIdentity {
  merchantId: string;
  email: string;
  accountStatus: string;
}

// Looks up who the given Client ID/Secret actually authenticate as, via
// PayPal's own identity endpoint — called right after fetchAccessToken
// succeeds in the admin "Connect PayPal" flow, so the merchant id/email
// shown afterward come from PayPal itself, not from anything the admin
// typed. Deliberately a separate call from fetchAccessToken/
// testPaypalConnection above: some REST apps don't have the identity/
// userinfo scope enabled, so a failure here is handled by the caller as a
// best-effort miss, not the same as a failed authentication.
export async function fetchMerchantIdentity(creds: PaypalCredentials): Promise<MerchantIdentity> {
  const token = await fetchAccessToken(creds);
  const res = await fetch(`${baseUrl(creds.environment)}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PayPal identity lookup failed (HTTP ${res.status}). ${body}`);
  }
  const data = await res.json();
  const emails: { value: string; primary?: boolean }[] = data.emails ?? [];
  const email = emails.find((e) => e.primary)?.value ?? emails[0]?.value ?? "";
  return {
    merchantId: data.payer_id ?? "",
    email,
    accountStatus: data.verified_account ? "verified" : "unverified",
  };
}

export interface WebhookVerificationInput {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
  webhookId: string;
  webhookEvent: unknown;
}

// Verifies a webhook's signature via PayPal's own verify-webhook-signature
// endpoint — the request is never trusted based on its shape alone. Returns
// false for anything short of an explicit "SUCCESS" verification status.
export async function verifyPaypalWebhookSignature(creds: PaypalCredentials, input: WebhookVerificationInput): Promise<boolean> {
  const token = await fetchAccessToken(creds);
  const res = await fetch(`${baseUrl(creds.environment)}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      transmission_id: input.transmissionId,
      transmission_time: input.transmissionTime,
      cert_url: input.certUrl,
      auth_algo: input.authAlgo,
      transmission_sig: input.transmissionSig,
      webhook_id: input.webhookId,
      webhook_event: input.webhookEvent,
    }),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => null);
  return data?.verification_status === "SUCCESS";
}
