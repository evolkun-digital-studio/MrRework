import "server-only";
import { NextResponse } from "next/server";

// In-memory, fixed-window rate limiter — deliberately dependency-free and
// scoped to this one Node process. That's a correct fit for this app: it's
// a single long-lived Node server (not a serverless/multi-instance
// deployment — see the same reasoning behind the crash fix in
// multipartUpload.ts), so a shared in-memory Map is process-wide state that
// every request actually sees. If this app is ever horizontally scaled
// across multiple instances, this would need to move to a shared store
// (Redis/Upstash) — call sites (`checkRateLimit`) wouldn't need to change,
// only this file's internals.
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so one-off keys (e.g. a per-IP+route combo hit once
// and never again) don't accumulate in memory forever. Runs at most once
// per interval, piggybacking on whichever request happens to trigger it.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanupAt = Date.now();
function cleanupExpiredBuckets() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// Fixed-window counter keyed by an arbitrary caller-supplied string (see
// rateLimitKey() below for the recommended shape). Each distinct key gets
// its own independent window/count — callers combine multiple keys (e.g.
// one scoped to the client IP, one scoped to the submitted email) by
// calling this more than once and rejecting if ANY of them fails, which is
// what every route below does via rateLimitOrThrow-style checks.
export function checkRateLimit(key: string, options: { windowMs: number; max: number }): RateLimitResult {
  cleanupExpiredBuckets();
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, remaining: options.max - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= options.max) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { ok: true, remaining: options.max - existing.count, retryAfterSeconds: 0 };
}

// Best-effort client IP extraction — mirrors the exact
// x-forwarded-for-first-entry-then-x-real-ip pattern already used in
// customerAuth.ts/account.ts for session device tracking, rather than a
// second, slightly different implementation of the same lookup.
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

// Builds a namespaced bucket key so unrelated routes/scopes never collide
// in the shared `buckets` map even if they happen to rate-limit the same
// raw IP or email.
export function rateLimitKey(scope: string, identifier: string): string {
  return `${scope}:${identifier.toLowerCase()}`;
}

// Every route below returns this exact shape for a rate-limited request —
// a shared helper so a 429's body/headers can't drift between call sites.
export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
  );
}
