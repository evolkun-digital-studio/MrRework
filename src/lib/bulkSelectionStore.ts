import { create } from "zustand";

// Selection state for the admin products list's bulk-management feature.
// A plain Zustand store (not component state) rather than state lifted to
// the products page — the same reason useCart/useWishlist are stores
// instead of page-local state: selection needs to survive pagination
// (paging is a full re-fetch, not just scrolling), which a store gets for
// free and component state would lose on nothing more than a page-number
// change re-rendering the list.
interface BulkSelectionState {
  selectedIds: Set<string>;
  // "Select all N matching current filters" mode — when true, the bulk job
  // is created with `filters` (re-resolved server-side into an ID list at
  // request time) rather than the possibly-partial `selectedIds` the client
  // has actually seen/fetched.
  selectAllMatching: boolean;
  matchingFilters: Record<string, unknown> | null;
  matchingCount: number;

  toggle: (id: string) => void;
  selectMany: (ids: string[]) => void;
  deselectMany: (ids: string[]) => void;
  setSelectAllMatching: (filters: Record<string, unknown>, count: number) => void;
  clear: () => void;
  count: () => number;
}

export const useBulkSelection = create<BulkSelectionState>()((set, get) => ({
  selectedIds: new Set(),
  selectAllMatching: false,
  matchingFilters: null,
  matchingCount: 0,

  toggle: (id) => set((s) => {
    const next = new Set(s.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Any manual toggle overrides "select all matching filters" mode —
    // the admin is now curating an explicit list.
    return { selectedIds: next, selectAllMatching: false };
  }),

  selectMany: (ids) => set((s) => {
    const next = new Set(s.selectedIds);
    for (const id of ids) next.add(id);
    return { selectedIds: next, selectAllMatching: false };
  }),

  deselectMany: (ids) => set((s) => {
    const next = new Set(s.selectedIds);
    for (const id of ids) next.delete(id);
    return { selectedIds: next };
  }),

  setSelectAllMatching: (filters, count) => set({
    selectAllMatching: true, matchingFilters: filters, matchingCount: count, selectedIds: new Set(),
  }),

  clear: () => set({ selectedIds: new Set(), selectAllMatching: false, matchingFilters: null, matchingCount: 0 }),

  count: () => {
    const s = get();
    return s.selectAllMatching ? s.matchingCount : s.selectedIds.size;
  },
}));
