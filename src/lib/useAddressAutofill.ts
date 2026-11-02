import { useEffect, useMemo, useRef, useState } from "react";
import { getCountryOptions, getStateOptions, getCityOptions, findStateByName, type GeoOption } from "@/lib/geoData";
import { lookupPostalCode, PostalLookupError } from "@/lib/addressLookup";

interface AddressValues {
  country: string;
  state: string;
  city: string;
  postalCode: string;
}

type AddressField = "country" | "state" | "city" | "postalCode";

const LOOKUP_DEBOUNCE_MS = 500;

// Drives the checkout "Delivery" section's Country -> State -> City cascade
// plus postal-code autofill (src/app/checkout/page.tsx). Kept as a hook
// rather than a component since the four fields it manages sit in three
// different rows of that page's existing form layout, interleaved with
// unrelated fields (name, phone, street address) — a single wrapper
// component would force them all into one place. `countryIso`/`stateIso`
// exist only to drive the country-state-city lookups; FormState keeps the
// human-readable name, which is what shippingCalculator.ts's
// isInternational() and the order's shippingAddress actually need.
export function useAddressAutofill(values: AddressValues, onChange: (field: AddressField, value: string) => void) {
  const [countryIso, setCountryIso] = useState<string | undefined>();
  const [stateIso, setStateIso] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const countryOptions = useMemo(() => getCountryOptions(), []);
  const stateOptions = useMemo(() => (countryIso ? getStateOptions(countryIso) : []), [countryIso]);
  const cityOptions = useMemo(() => (countryIso && stateIso ? getCityOptions(countryIso, stateIso) : []), [countryIso, stateIso]);

  function runLookup(iso: string, postalCode: string) {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (!iso || !postalCode.trim()) { setLoading(false); return; }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setLookupError("");
      try {
        const result = await lookupPostalCode(iso, postalCode, controller.signal);
        if (controller.signal.aborted) return;
        if (!result) {
          setLookupError("Invalid postal code. Unable to fetch location details.");
          return;
        }
        const matchedState = result.state ? findStateByName(iso, result.state) : undefined;
        if (matchedState) {
          setStateIso(matchedState.isoCode);
          onChange("state", matchedState.name);
        } else if (result.state) {
          // Not in the bundled dataset under that exact name — still fill
          // in what the API returned rather than silently dropping it.
          setStateIso(undefined);
          onChange("state", result.state);
        }
        if (result.city) onChange("city", result.city);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof PostalLookupError) setLookupError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, LOOKUP_DEBOUNCE_MS);
  }

  function changeCountry(text: string) {
    onChange("country", text);
    setLookupError("");
    // A hand-edit that no longer matches the selected option invalidates
    // the cascade — clear it so State/City stop reflecting a country that's
    // no longer actually selected.
    const current = countryIso ? countryOptions.find((o) => o.code === countryIso) : undefined;
    if (current && current.label !== text) {
      setCountryIso(undefined);
      setStateIso(undefined);
      onChange("state", "");
      onChange("city", "");
    }
  }

  function selectCountry(option: GeoOption) {
    setCountryIso(option.code);
    setStateIso(undefined);
    onChange("state", "");
    onChange("city", "");
    setLookupError("");
    // Country changed after a postal code was already entered — re-run the
    // lookup against the new country rather than leaving a stale State/City.
    if (values.postalCode.trim()) runLookup(option.code, values.postalCode);
  }

  function changeState(text: string) {
    onChange("state", text);
    const current = stateIso ? stateOptions.find((o) => o.code === stateIso) : undefined;
    if (current && current.label !== text) {
      setStateIso(undefined);
      onChange("city", "");
    }
  }

  function selectState(option: GeoOption) {
    setStateIso(option.code);
    onChange("city", "");
  }

  function changeCity(text: string) {
    onChange("city", text);
  }

  function changePostalCode(text: string) {
    onChange("postalCode", text);
    setLookupError("");
    runLookup(countryIso ?? "", text);
  }

  return {
    countryOptions, stateOptions, cityOptions,
    countryIso, stateIso, loading, lookupError,
    changeCountry, selectCountry, changeState, selectState, changeCity, changePostalCode,
  };
}
