import "server-only";
import type { MediaSourceModule } from "./types";
import { productImageSource } from "./sources/productImageSource";
import { categoryImageSource } from "./sources/categoryImageSource";

// The single place a new media source gets plugged in — the scan endpoint,
// the pre-flight summary, and the migration engine all read from this
// array. Activating Collection/Blog/Page/Customer-avatar/Review later means
// writing one file (a collectReferences()/applyReference() pair, following
// productImageSource.ts's shape) and flipping its status here; nothing else
// in this feature needs to change.
export const MEDIA_SOURCES: MediaSourceModule[] = [
  productImageSource,
  categoryImageSource,
  { key: "collection", label: "Collection Images", description: "Hero images on Collections.", status: "coming-soon" },
  { key: "blog", label: "Blog Images", description: "Featured images and in-content images on Blog Posts.", status: "coming-soon" },
  { key: "page", label: "Page Images", description: "Images on static Pages (once Pages exist).", status: "coming-soon" },
  { key: "customer-avatar", label: "Customer Avatars", description: "Customer/admin profile images.", status: "coming-soon" },
  { key: "review", label: "Review Images", description: "Images attached to product reviews.", status: "coming-soon" },
];

export function getMediaSource(key: string): MediaSourceModule | undefined {
  return MEDIA_SOURCES.find((s) => s.key === key);
}

export function availableMediaSources(): MediaSourceModule[] {
  return MEDIA_SOURCES.filter((s) => s.status === "available");
}

/** Safe, client-shippable subset. */
export function serializeMediaSources() {
  return MEDIA_SOURCES.map(({ key, label, description, status }) => ({ key, label, description, status }));
}
