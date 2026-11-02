import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAccountUser, serializeUser } from "@/lib/account";

export const dynamic = "force-dynamic";

// PATCH — set as default card.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const user = await getOrCreateAccountUser();
  const card = user.paymentMethods.id(id);
  if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });

  if (body?.isDefault === true) {
    for (const c of user.paymentMethods) c.isDefault = false;
    card.isDefault = true;
    await user.save();
  }

  return NextResponse.json({ items: serializeUser(user).paymentMethods });
}

// DELETE — remove a saved card.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getOrCreateAccountUser();
  const card = user.paymentMethods.id(id);
  if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });

  const wasDefault = card.isDefault;
  card.deleteOne();
  if (wasDefault && user.paymentMethods.length) user.paymentMethods[0].isDefault = true;

  await user.save();
  return NextResponse.json({ items: serializeUser(user).paymentMethods });
}
