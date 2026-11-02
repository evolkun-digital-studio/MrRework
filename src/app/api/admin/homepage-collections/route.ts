import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { HomepageCollectionsModel } from "@/models/HomepageCollections";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { getBestSellingHomeProducts, getTrendingHomeProducts } from "@/lib/data";

export const dynamic = "force-dynamic";

// Seeds the same copy already hardcoded on the storefront today, so saving
// nothing yet changes nothing live — mirrors the same "seed from current
// defaults" approach as /api/admin/luxury-promo.
const SEED = {
  latestDrops: { title: "Latest Drops", subtitle: "Fresh arrivals, just in.", ctaText: "View Products" },
  bestSelling: { title: "Best Selling", subtitle: "Unmatched design—superior performance and customer satisfaction in one.", ctaText: "View Products" },
  trending: { title: "Trending", subtitle: "The styles everyone's reaching for right now.", ctaText: "View Products" },
};

async function getOrCreateSettings() {
  let settings = await HomepageCollectionsModel.findOne();
  if (!settings) settings = await HomepageCollectionsModel.create(SEED);
  return settings;
}

function toPreview(products: { _id: string; name: string; sku: string; images?: string[] }[]) {
  return products.map((p) => ({ _id: p._id, name: p.name, sku: p.sku, image: p.images?.[0] ?? "" }));
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const settings = await getOrCreateSettings();
  // What's actually resolving onto each homepage rail right now — shown in
  // the admin UI regardless of automatic/manual mode, so "this section has
  // no products" is visible immediately instead of only discoverable by
  // checking the storefront.
  const [bestSellingPreview, trendingPreview] = await Promise.all([
    getBestSellingHomeProducts(),
    getTrendingHomeProducts(),
  ]);
  return NextResponse.json({
    settings,
    previews: { bestSelling: toPreview(bestSellingPreview), trending: toPreview(trendingPreview) },
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.latestDrops || !body?.bestSelling || !body?.trending) {
    return NextResponse.json({ error: "latestDrops, bestSelling, and trending are all required." }, { status: 400 });
  }

  await dbConnect();
  const settings = await getOrCreateSettings();
  settings.latestDrops = body.latestDrops;
  settings.bestSelling = body.bestSelling;
  settings.trending = body.trending;
  await settings.save();

  logActivity({ type: "settings_update", adminUserId: String(admin._id), targetType: "HomepageCollections", message: `${admin.email} updated the Latest Drops/Best Selling/Trending homepage collections.` });
  return NextResponse.json({ settings });
}
