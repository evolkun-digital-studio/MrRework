import "server-only";
import { getMediaSource } from "./registry";
import type { MediaReference } from "./types";

// The generic write-back step — dispatches to whichever registered source
// owns a given reference. Adding a new source later needs nothing here:
// as long as its registry entry has an applyReference(), this keeps working.
export async function applyReference(ref: MediaReference, localUrl: string): Promise<void> {
  const source = getMediaSource(ref.sourceType);
  if (!source?.applyReference) return;
  await source.applyReference(ref, localUrl);
}
