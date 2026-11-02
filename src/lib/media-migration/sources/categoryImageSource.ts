import "server-only";
import { CategoryModel } from "@/models/Category";
import type { MediaReference, MediaSourceModule } from "../types";

// Real source #2. Category has a single `image` field (no array), so this
// is simpler than the product source — one reference per category at most.
async function* collectReferences(): AsyncGenerator<MediaReference> {
  const cursor = CategoryModel.find({ image: { $regex: "^https?://", $options: "i" } })
    .select("_id name image")
    .lean()
    .cursor();

  for await (const doc of cursor as any) {
    yield { sourceType: "category", sourceId: String(doc._id), field: "image", url: doc.image, altText: doc.name, title: doc.name };
  }
}

async function applyReference(ref: MediaReference, localUrl: string): Promise<void> {
  await CategoryModel.updateOne({ _id: ref.sourceId, image: ref.url }, { $set: { image: localUrl } });
}

export const categoryImageSource: MediaSourceModule = {
  key: "category",
  label: "Category Images",
  description: "Category images that still point at an external URL.",
  status: "available",
  collectReferences,
  applyReference,
};
