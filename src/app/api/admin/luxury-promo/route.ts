import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { LuxuryPromoSectionModel } from "@/models/LuxuryPromoSection";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

// Mirrors the component's own DEFAULT_LEFT/DEFAULT_RIGHT — used only to
// seed the singleton the first time an admin opens this page, so the form
// (and the storefront, until something is actually edited) starts from the
// exact content already live today rather than a blank slate.
const SEED = {
  left: {
    eyebrow: "Breezy and Relaxed", heading: "Effortless Style",
    image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/05/Screenshot-2026-05-04-153933.webp",
    imageAlt: "", objectPosition: "",
  },
  right: {
    eyebrow: "Bold and Unique", heading: "Modern Edge",
    image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/05/Screenshot-2026-05-04-154904.webp",
    imageAlt: "", objectPosition: "",
  },
};

async function getOrCreateSection() {
  let section = await LuxuryPromoSectionModel.findOne();
  if (!section) section = await LuxuryPromoSectionModel.create(SEED);
  return section;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const section = await getOrCreateSection();
  return NextResponse.json({ section });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.left || !body?.right) {
    return NextResponse.json({ error: "left and right cards are both required." }, { status: 400 });
  }

  await dbConnect();
  const section = await getOrCreateSection();
  section.left = body.left;
  section.right = body.right;
  await section.save();

  logActivity({ type: "settings_update", adminUserId: String(admin._id), targetType: "LuxuryPromoSection", message: `${admin.email} updated the homepage Luxury Promo section.` });
  return NextResponse.json({ section });
}
