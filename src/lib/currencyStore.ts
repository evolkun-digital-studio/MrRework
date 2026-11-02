import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SUPPORTED_CURRENCIES = ["GBP", "EUR", "USD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_META: Record<CurrencyCode, { symbol: string; label: string }> = {
  GBP: { symbol: "£", label: "Pound Sterling" },
  EUR: { symbol: "€", label: "Euro" },
  USD: { symbol: "$", label: "US Dollar" },
};

interface CurrencyState {
  currency: CurrencyCode;
  rate: number; // GBP -> currency, e.g. 1.17 for EUR. Always 1 for GBP.
  setCurrency: (currency: CurrencyCode) => void;
}

// Same public endpoint checkout's destination-based conversion already uses
// (src/app/api/currency/rate, backed by getExchangeRate) — one Frankfurter
// source for every GBP -> X rate shown anywhere in the app.
async function fetchRate(currency: CurrencyCode): Promise<number> {
  if (currency === "GBP") return 1;
  try {
    const res = await fetch(`/api/currency/rate?currency=${currency}`);
    const data = await res.json();
    return typeof data.rate === "number" ? data.rate : 1;
  } catch {
    return 1;
  }
}

export const useCurrency = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: "GBP",
      rate: 1,
      setCurrency: (currency) => {
        set({ currency });
        fetchRate(currency).then((rate) => set({ rate }));
      },
    }),
    {
      name: "epure-currency",
      // Rates move daily — only the chosen code is worth persisting, not a
      // rate value that could otherwise go stale across browser sessions.
      partialize: (s) => ({ currency: s.currency }),
      onRehydrateStorage: () => (state) => {
        if (state && state.currency !== "GBP") {
          fetchRate(state.currency).then((rate) => useCurrency.setState({ rate }));
        }
      },
    }
  )
);
