import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { SubscriberModel } from "@/models/Subscriber";

export const dynamic = "force-dynamic";

// Same basic shape check used for every other email field in this app
// (customerAuth.ts, account/route.ts), plus an explicit length cap — the
// old regex here had no upper bound and would accept (and, until now,
// silently discard) an email of any length.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;

// Previously validated the email, then always returned a fabricated
// success message with a `// TODO: persist` comment — every real signup
// was silently discarded. Now actually persisted, with duplicate
// detection (resubscribing is treated as a success, not an error — a
// customer re-entering an email they already used has no way to know
// that, and it isn't a mistake worth blocking) and distinct
// success/error responses so the frontend's existing idle/loading/done/
// error states (see NewsletterForm.tsx, unchanged) have real content to
// show instead of a message that was always the same regardless of what
// happened server-side.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!rawEmail || rawEmail.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(rawEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  await dbConnect();

  const existing = await SubscriberModel.findOne({ email: rawEmail }).lean();
  if (existing) {
    return NextResponse.json({ ok: true, message: "You're already on the list." });
  }

  try {
    await SubscriberModel.create({ email: rawEmail });
  } catch (err: any) {
    // Racy against a concurrent signup with the same email — the unique
    // index on `email` is the real guard; treat it as the same successful
    // "already subscribed" outcome rather than a 500.
    if (err?.code !== 11000) throw err;
  }

  return NextResponse.json({ ok: true, message: "You're on the list." });
}
