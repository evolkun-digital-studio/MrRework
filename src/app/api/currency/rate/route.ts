import { NextRequest, NextResponse } from "next/server";
import { getExchangeRate } from "@/lib/currency/exchangeRates";

export const dynamic = "force-dynamic";

// Public — lets checkout show its totals in the currency of whatever
// country is selected in the address form, without exposing the
// Frankfurter call (or its cache) to the client directly.
export async function GET(req: NextRequest) {
  const currency = (req.nextUrl.searchParams.get("currency") ?? "GBP").toUpperCase();
  const rate = await getExchangeRate(currency);
  return NextResponse.json({ currency, rate });
}
