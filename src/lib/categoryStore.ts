"use client";
import { useEffect } from "react";
import { create } from "zustand";

// Product.category stores a URL-safe slug (e.g. "wool-and-cashmere"), not a
// display name — this store resolves slugs to their real Category.name for
// presentation everywhere a product's category is shown to a human, without
// touching how category is stored on Product documents.
interface CategoryNameState {
  names: Record<string, string>;
  loaded: boolean;
  loading: boolean;
  seed: (categories: { slug: string; name: string }[]) => void;
  ensureLoaded: () => void;
}

export const useCategoryNameStore = create<CategoryNameState>((set, get) => ({
  names: {},
  loaded: false,
  loading: false,
  seed: (categories) => {
    if (!categories.length) return;
    set((s) => ({
      names: { ...s.names, ...Object.fromEntries(categories.map((c) => [c.slug, c.name])) },
      loaded: true,
    }));
  },
  ensureLoaded: () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data: { items?: { slug: string; name: string }[] }) => {
        const items = data.items ?? [];
        set((s) => ({
          names: { ...Object.fromEntries(items.map((c) => [c.slug, c.name])), ...s.names },
          loaded: true,
          loading: false,
        }));
      })
      .catch(() => set({ loading: false }));
  },
}));

// Synchronous fallback for a slug with no known Category match yet (before
// the fetch above resolves, or a legacy/orphaned slug with no live Category
// document) — Title Case with hyphens turned into spaces.
export function prettifySlug(slug: string): string {
  if (!slug) return "";
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// Resolves a Product.category slug to its human-readable Category.name.
// Triggers a one-time, app-wide fetch of /api/categories on first use
// (deduped across every component calling this hook); pages that already
// have the category list (e.g. the shop page) should call `seed()` instead
// so this hook resolves correctly on the very first render, no flash.
export function useCategoryName(slug: string): string {
  const name = useCategoryNameStore((s) => s.names[slug]);
  const ensureLoaded = useCategoryNameStore((s) => s.ensureLoaded);
  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);
  return name ?? prettifySlug(slug);
}
