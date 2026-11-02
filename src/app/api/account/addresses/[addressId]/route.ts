import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAccountUser, serializeUser } from "@/lib/account";

export const dynamic = "force-dynamic";

const FIELDS = ["firstName", "lastName", "phone", "country", "state", "city", "address", "apartment", "postalCode"] as const;

// PATCH — edit fields on one address, and/or set it as default shipping/billing.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ addressId: string }> }) {
  const { addressId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const user = await getOrCreateAccountUser();
  const addr = user.addresses.id(addressId);
  if (!addr) return NextResponse.json({ error: "Address not found." }, { status: 404 });

  for (const f of FIELDS) {
    if (f in body) addr[f] = String(body[f] ?? "").trim();
  }
  if (body.isDefaultShipping === true) {
    for (const a of user.addresses) a.isDefaultShipping = false;
    addr.isDefaultShipping = true;
  }
  if (body.isDefaultBilling === true) {
    for (const a of user.addresses) a.isDefaultBilling = false;
    addr.isDefaultBilling = true;
  }

  await user.save();
  return NextResponse.json({ items: serializeUser(user).addresses });
}

// DELETE — remove an address. If it was a default, promote the next
// remaining address (if any) so there's always a default when possible.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ addressId: string }> }) {
  const { addressId } = await params;
  const user = await getOrCreateAccountUser();
  const addr = user.addresses.id(addressId);
  if (!addr) return NextResponse.json({ error: "Address not found." }, { status: 404 });

  const wasShipping = addr.isDefaultShipping;
  const wasBilling = addr.isDefaultBilling;
  addr.deleteOne();

  if (wasShipping && user.addresses.length) user.addresses[0].isDefaultShipping = true;
  if (wasBilling && user.addresses.length) user.addresses[0].isDefaultBilling = true;

  await user.save();
  return NextResponse.json({ items: serializeUser(user).addresses });
}
