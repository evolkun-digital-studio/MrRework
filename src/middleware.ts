import { NextResponse, type NextRequest } from "next/server";

// Mirrors the cookie name/options in src/lib/cartSession.ts exactly. That
// helper can only *set* a fresh cookie from a Route Handler or Server Action
// (Next.js forbids writing cookies during a plain Server Component render),
// which broke the new /account layout — a Server Component — for anyone
// without a session yet. Ensuring the cookie exists here, before any route
// renders, means getOrCreateCartSessionId() always finds it already set and
// never needs to write one itself outside a Route Handler. Cart/Wishlist are
// unaffected: they just see the cookie pre-created instead of creating it.
const COOKIE = "epure_cart_sid";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days

// Admin-panel gate: a fast, Edge-safe redirect for anyone with no admin
// session cookie at all. This is a UX fast-path, not the security boundary —
// the Edge runtime can't run a Mongoose/DB lookup, so it can only check
// "does a cookie exist", not "is it a valid, unexpired admin session for a
// role:admin user". That authoritative check happens server-side (Node
// runtime) in src/app/admin/(dashboard)/layout.tsx and in every
// /api/admin/** route via getAdminSession()/requireAdmin() — both of which
// redirect/401 on their own even if this check were somehow bypassed.
const ADMIN_COOKIE = "epure_admin_sid";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only ever redirects the *unauthenticated* direction here. The reverse
  // (already logged in, redirect away from /admin/login) is handled inside
  // the login page itself via a real DB-backed session check — doing it
  // here too, based only on cookie *presence*, would infinite-loop for a
  // stale/expired cookie: this redirects to /admin, the dashboard layout's
  // authoritative check finds the session invalid and redirects back to
  // /admin/login, which (cookie still present) redirects to /admin again.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !req.cookies.get(ADMIN_COOKIE)) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  if (req.cookies.get(COOKIE)) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set(COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
