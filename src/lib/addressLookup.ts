// Postal-code -> State/City autofill for the checkout "Postal code" field
// (src/components/checkout/LocationFields.tsx), backed by the free,
// keyless Zippopotam.us API (https://api.zippopotam.us). That API only
// resolves a postal code *within* a known country, so the caller must
// already have a country selected — there's no endpoint that guesses the
// country from the code alone.

export interface PostalLookupResult {
  country: string;
  state: string;
  city: string;
}

// Thrown for a network/server failure so the caller can tell "this postal
// code doesn't exist" (a normal, expected outcome — see the `null` return
// below) apart from "we couldn't ask the API at all".
export class PostalLookupError extends Error {}

async function fetchPlace(countryIso2: string, code: string, signal?: AbortSignal): Promise<PostalLookupResult | null> {
  let res: Response;
  try {
    res = await fetch(`https://api.zippopotam.us/${countryIso2.toLowerCase()}/${encodeURIComponent(code)}`, { signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new PostalLookupError("Could not reach the postal code lookup service.");
  }

  // Zippopotam returns 404 for both "postal code doesn't exist" and
  // "country not covered by this API" — both are a normal "not found"
  // outcome for the customer, not a system error.
  if (res.status === 404) return null;
  if (!res.ok) throw new PostalLookupError("Could not reach the postal code lookup service.");

  const data = await res.json();
  const place = data.places?.[0];
  if (!place) return null;

  return {
    country: data.country ?? "",
    state: place.state ?? "",
    city: place["place name"] ?? "",
  };
}

// UK postcodes are always typed as "outward code" + "inward code" (e.g.
// "EC1A 1BB") — the inward part is invariably 3 characters (a digit then
// two letters). Zippopotam's GB dataset, unlike the rest of its coverage,
// only indexes the outward code: a full postcode 404s even when it's
// perfectly valid. Falling back to the outward portion alone (however the
// customer typed the full code, with or without the space) is what makes
// autofill actually work for the UK instead of silently failing every time.
function ukOutwardCode(code: string): string | null {
  const compact = code.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 5) return null;
  return compact.slice(0, -3);
}

export async function lookupPostalCode(
  countryIso2: string,
  postalCode: string,
  signal?: AbortSignal
): Promise<PostalLookupResult | null> {
  const code = postalCode.trim();
  if (!countryIso2 || !code) return null;

  const result = await fetchPlace(countryIso2, code, signal);
  if (result) return result;

  if (countryIso2.toUpperCase() === "GB") {
    const outward = ukOutwardCode(code);
    if (outward && outward !== code.toUpperCase()) return fetchPlace(countryIso2, outward, signal);
  }

  return null;
}
