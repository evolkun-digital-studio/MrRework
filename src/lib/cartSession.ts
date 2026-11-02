import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const COOKIE = "epure_cart_sid";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days

// Reads the guest cart session id, creating one if this is a first-time visitor.
// There is no auth system yet, so every cart today is a "guest" cart keyed by
// this cookie; the Cart model's optional `user` field is ready for when login exists.
export async function getOrCreateCartSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;

  const sid = randomUUID();
  jar.set(COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
  return sid;
}
