import "server-only";

// GBP -> target-currency rates via Frankfurter (ECB data, free, no API key).
// Rates only publish once a day, so an in-process cache well under that
// keeps checkout from firing a request on every keystroke of the address
// form without ever showing a rate more than an hour stale.
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { rate: number; expires: number }>();

export async function getExchangeRate(targetCurrency: string): Promise<number> {
  const code = targetCurrency.trim().toUpperCase();
  if (!code || code === "GBP") return 1;

  const cached = cache.get(code);
  if (cached && cached.expires > Date.now()) return cached.rate;

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=GBP&to=${code}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Frankfurter responded ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.[code];
    if (typeof rate !== "number") throw new Error(`No rate for ${code}`);
    cache.set(code, { rate, expires: Date.now() + CACHE_TTL_MS });
    return rate;
  } catch {
    // Frankfurter doesn't publish every currency (or the request failed) —
    // fall back to a still-cached rate rather than nothing, else 1:1 GBP.
    return cached?.rate ?? 1;
  }
}
