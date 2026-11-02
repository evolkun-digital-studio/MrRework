// Offline Country -> State -> City dataset for the checkout address dropdowns
// (src/components/checkout/LocationFields.tsx), backed by the bundled
// `country-state-city` package rather than a live API — no network
// dependency, no rate limits, and it can't go down mid-checkout.
//
// Checkout stores the human-readable name (not the ISO code) in
// FormState.country/state/city, since that's what src/lib/shipping/
// shippingCalculator.ts's isInternational() compares against the
// admin-configured "Origin country" text field (a free-typed name, e.g.
// "United Kingdom" — see src/app/admin/(dashboard)/settings/shipping/page.tsx).
// The ISO codes below exist only to drive the country -> state -> city
// cascade; they're never sent to the server.
import { Country, State, City } from "country-state-city";

export interface GeoOption {
  code: string;
  label: string;
}

export function getCountryOptions(): GeoOption[] {
  return Country.getAllCountries().map((c) => ({ code: c.isoCode, label: c.name }));
}

export function getStateOptions(countryIso2: string): GeoOption[] {
  if (!countryIso2) return [];
  return State.getStatesOfCountry(countryIso2).map((s) => ({ code: s.isoCode, label: s.name }));
}

export function getCityOptions(countryIso2: string, stateIso2: string): GeoOption[] {
  if (!countryIso2 || !stateIso2) return [];
  return City.getCitiesOfState(countryIso2, stateIso2).map((c) => ({ code: c.name, label: c.name }));
}

export function findCountryByIso(iso2: string) {
  return Country.getAllCountries().find((c) => c.isoCode === iso2);
}

// Case-insensitive exact-name match — used to resolve a postal-lookup API's
// free-text state name (e.g. "Delhi") back to its isoCode so the City
// dropdown can be populated for it.
export function findStateByName(countryIso2: string, name: string) {
  const target = name.trim().toLowerCase();
  if (!target) return undefined;
  return State.getStatesOfCountry(countryIso2).find((s) => s.name.trim().toLowerCase() === target);
}
