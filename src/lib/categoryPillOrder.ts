// Homepage "Categories" section — curated display order + label casing for
// the pill row. The homepage already fetches the live category list via
// getCategories() (src/lib/data.ts); page.tsx filters this order against
// that live list by slug, so a pill only renders when its category actually
// exists in the database ("if the following categories exist, display them
// in this order") and disappears/appears automatically as categories are
// added or removed — no hardcoded snapshot to keep in sync by hand. Slugs
// were checked against the live `/api/categories` response; labels use the
// requested display casing rather than the database's own `name` field
// (which is inconsistently ALL CAPS for some categories).
export const CATEGORY_PILL_ORDER: { label: string; slug: string }[] = [
  { label: "Bundles", slug: "bundles" },
  { label: "Cardigans", slug: "cardigans" },
  { label: "Carhartt", slug: "carhartt" },
  { label: "Dickies", slug: "dickes" },
  { label: "Double Knee", slug: "double-knee" },
  { label: "Ed Hardy", slug: "ed-hardy" },
  { label: "Harley Davidson", slug: "harley-davidson" },
  { label: "Hoodies", slug: "hoodies" },
  { label: "Jackets", slug: "jacket" },
  { label: "Japanese Denim", slug: "japneese-denim" },
  { label: "Jerseys", slug: "jersey" },
  { label: "Levi's", slug: "levi-s" },
  { label: "Nike", slug: "nike" },
  { label: "Ralph Lauren", slug: "ralph-lauren" },
  { label: "Shirts", slug: "shirting" },
  { label: "Shorts", slug: "shorts" },
  { label: "Stussy", slug: "stussy" },
  { label: "Sweatshirts", slug: "sweatshirts" },
  { label: "The North Face", slug: "the-north-face" },
  { label: "True Religion", slug: "true-religion" },
  { label: "Vest", slug: "vest" },
];
