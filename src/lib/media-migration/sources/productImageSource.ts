import "server-only";
import { ProductModel } from "@/models/Product";
import type { MediaReference, MediaSourceModule } from "../types";

const EXTERNAL_URL = /^https?:\/\//i;

// Real source #1 — Products already carry external WooCommerce image URLs
// in images[]/hoverImage after the Product Migration Workflow. Nothing here
// touches Product CRUD or wooProductImporter.ts; it only reads Product and,
// once a download succeeds, writes the one matching array slot back.
async function* collectReferences(): AsyncGenerator<MediaReference> {
  const cursor = ProductModel.find({
    $or: [{ images: { $regex: "^https?://", $options: "i" } }, { hoverImage: { $regex: "^https?://", $options: "i" } }],
  })
    .select("_id name images hoverImage")
    .lean()
    .cursor(); // streamed, not loaded into memory all at once — matters at "tens of thousands" scale

  for await (const doc of cursor as any) {
    const images: string[] = doc.images ?? [];
    for (let i = 0; i < images.length; i++) {
      if (EXTERNAL_URL.test(images[i])) {
        yield { sourceType: "product", sourceId: String(doc._id), field: "images", index: i, url: images[i], altText: doc.name, title: doc.name };
      }
    }
    if (doc.hoverImage && EXTERNAL_URL.test(doc.hoverImage)) {
      yield { sourceType: "product", sourceId: String(doc._id), field: "hoverImage", url: doc.hoverImage, altText: doc.name, title: doc.name };
    }
  }
}

async function applyReference(ref: MediaReference, localUrl: string): Promise<void> {
  if (ref.field === "images" && ref.index !== undefined) {
    // Positional-array update — replaces only the one slot that matched the
    // old URL, leaving every other image on the product untouched. If the
    // product's images[] changed since collectReferences() ran (e.g. a
    // concurrent admin edit), the $elemMatch condition simply won't match
    // and this becomes a safe no-op rather than corrupting the array.
    await ProductModel.updateOne(
      { _id: ref.sourceId, [`images.${ref.index}`]: ref.url },
      { $set: { [`images.${ref.index}`]: localUrl } }
    );
  } else if (ref.field === "hoverImage") {
    await ProductModel.updateOne({ _id: ref.sourceId, hoverImage: ref.url }, { $set: { hoverImage: localUrl } });
  }
}

export const productImageSource: MediaSourceModule = {
  key: "product",
  label: "Product Images",
  description: "Images and hover-images on migrated products that still point at an external URL.",
  status: "available",
  collectReferences,
  applyReference,
};
