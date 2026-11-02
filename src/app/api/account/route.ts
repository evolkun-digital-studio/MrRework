import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAccountUser, serializeUser } from "@/lib/account";
import { clearOtherCustomerSessions } from "@/lib/customerAuth";
import { UserModel } from "@/models/User";
import { CartModel } from "@/models/Cart";
import { WishlistModel } from "@/models/Wishlist";
import { OrderModel } from "@/models/Order";

export const dynamic = "force-dynamic";

const GENDERS = ["female", "male", "non-binary", "prefer-not-to-say"];
const THEMES = ["light", "dark", "system"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET — bootstrap (creating if needed) and return the current account.
export async function GET() {
  const user = await getOrCreateAccountUser();
  return NextResponse.json(serializeUser(user));
}

// PATCH — update profile fields. Body is a partial set of editable fields;
// anything else (email uniqueness, sessionId, role, etc.) is ignored.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const user = await getOrCreateAccountUser();
  const previousEmail = user.email;

  if ("email" in body) {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (email) {
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      }
      const existing = await UserModel.findOne({ email, _id: { $ne: user._id } });
      if (existing) {
        return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
      }
      user.email = email;
    } else {
      user.email = undefined;
    }
  }
  if ("firstName" in body) user.firstName = String(body.firstName ?? "").trim().slice(0, 80);
  if ("lastName" in body) user.lastName = String(body.lastName ?? "").trim().slice(0, 80);
  if ("phone" in body) user.phone = String(body.phone ?? "").trim().slice(0, 40);
  if ("country" in body) user.country = String(body.country ?? "").trim().slice(0, 80);
  if ("language" in body) user.language = String(body.language ?? "en").trim().slice(0, 10) || "en";
  if ("currency" in body) user.currency = String(body.currency ?? "GBP").trim().toUpperCase().slice(0, 3) || "GBP";
  if ("theme" in body) {
    if (!THEMES.includes(body.theme)) return NextResponse.json({ error: "Invalid theme." }, { status: 400 });
    user.theme = body.theme;
  }
  if ("gender" in body) {
    if (body.gender !== null && !GENDERS.includes(body.gender)) {
      return NextResponse.json({ error: "Invalid gender value." }, { status: 400 });
    }
    user.gender = body.gender ?? undefined;
  }
  if ("dateOfBirth" in body) {
    if (body.dateOfBirth) {
      const d = new Date(body.dateOfBirth);
      if (Number.isNaN(d.getTime()) || d > new Date()) {
        return NextResponse.json({ error: "Invalid date of birth." }, { status: 400 });
      }
      user.dateOfBirth = d;
    } else {
      user.dateOfBirth = undefined;
    }
  }

  try {
    await user.save();
  } catch (err: any) {
    // The findOne check above is racy against a concurrent PATCH setting
    // the same email — the unique index on User.email is the real guard;
    // translate its duplicate-key error into the same clean 409 rather than
    // letting it surface as an unhandled 500.
    if (err?.code === 11000) {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
    throw err;
  }

  // Email doubles as this account's recovery address (forgot-password sends
  // there) — changing it is security-sensitive for the same reason a
  // password change is: any other device's session must not survive it.
  if ("email" in body && user.email !== previousEmail) {
    await clearOtherCustomerSessions(user);
  }

  return NextResponse.json(serializeUser(user));
}

// DELETE — permanently remove the account.
//
// Cart/Wishlist are live, mutable "shopping in progress" artifacts with no
// historical value once the account is gone. Critically, most of them are
// NOT actually stamped with a `user` field at all: POST /api/cart and
// POST /api/wishlist both resolve via getOrCreateCart(sessionId)/
// getOrCreateWishlist(sessionId) — plain sessionId lookups — and `user`
// only ever gets set by mergeGuestCartIntoUser(), which runs once at
// login/register/verify to fold in a PRE-EXISTING guest cart from a
// different device. A cart/wishlist created *while already logged in*
// (the common case) ends up keyed purely by this User document's own
// `sessionId` field (confirmed live: a freshly registered account's cart
// had `user: undefined`, matching only on sessionId) — so matching solely
// on `user: user._id` here would silently miss most real carts/wishlists.
// Matching on `sessionId: user.sessionId` too closes that gap, and is also
// what prevents this exact browser returning after deletion from having
// the deleted account's old cart/wishlist contents resurface under a
// brand-new shadow account.
//
// Orders are financial/business history and are deliberately NOT deleted —
// only detached: the dangling `user` reference is removed and the order is
// flagged `isGuestOrder`, matching how every other Order lookup in this
// codebase already falls back to `email` (see the `$or: [{user}, {email}]`
// pattern in /api/orders, /api/admin/customers/[id], etc.), so the order
// remains fully findable/reportable after the account is gone. Orders are
// only ever linked via `user` (never sessionId), so that part doesn't need
// the same OR.
export async function DELETE() {
  const user = await getOrCreateAccountUser();
  const ownedBy = user.sessionId ? [{ user: user._id }, { sessionId: user.sessionId }] : [{ user: user._id }];

  await Promise.all([
    CartModel.deleteMany({ $or: ownedBy }),
    WishlistModel.deleteMany({ $or: ownedBy }),
    OrderModel.updateMany({ user: user._id }, { $unset: { user: "" }, $set: { isGuestOrder: true } }),
  ]);

  await user.deleteOne();
  return NextResponse.json({ ok: true });
}
