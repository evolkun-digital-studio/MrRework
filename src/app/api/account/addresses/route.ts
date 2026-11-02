import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAccountUser, serializeUser } from "@/lib/account";

export const dynamic = "force-dynamic";

const REQUIRED = ["firstName", "lastName", "address", "city", "postalCode", "country"] as const;

// GET — list this account's saved addresses.
export async function GET() {
  const user = await getOrCreateAccountUser();
  return NextResponse.json({ items: serializeUser(user).addresses });
}

// POST — add a new address.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const missing = REQUIRED.filter((k) => !String(body[k] ?? "").trim());
  if (missing.length) {
    return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}.` }, { status: 400 });
  }

  const user = await getOrCreateAccountUser();
  const isFirst = user.addresses.length === 0;

  const address = {
    firstName: String(body.firstName).trim(), lastName: String(body.lastName).trim(),
    phone: String(body.phone ?? "").trim(), country: String(body.country).trim(),
    state: String(body.state ?? "").trim(), city: String(body.city).trim(),
    address: String(body.address).trim(), apartment: String(body.apartment ?? "").trim(),
    postalCode: String(body.postalCode).trim(),
    // The first address a user ever saves becomes both defaults automatically.
    isDefaultShipping: isFirst || !!body.isDefaultShipping,
    isDefaultBilling: isFirst || !!body.isDefaultBilling,
  };

  if (address.isDefaultShipping) for (const a of user.addresses) a.isDefaultShipping = false;
  if (address.isDefaultBilling) for (const a of user.addresses) a.isDefaultBilling = false;

  user.addresses.push(address);
  await user.save();

  return NextResponse.json({ items: serializeUser(user).addresses }, { status: 201 });
}
