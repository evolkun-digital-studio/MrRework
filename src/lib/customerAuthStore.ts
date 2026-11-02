import { create } from "zustand";

export interface AuthUser {
  _id: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

export type AuthModalView = "login" | "register" | "forgot";

interface CustomerAuthState {
  user: AuthUser | null;
  hydrated: boolean;
  modalOpen: boolean;
  modalView: AuthModalView;
  setUser: (user: AuthUser | null) => void;
  fetchMe: () => Promise<void>;
  openModal: (view?: AuthModalView) => void;
  closeModal: () => void;
  setModalView: (view: AuthModalView) => void;
}

// Deliberately NOT persisted to localStorage — the httpOnly customer session
// cookie (see src/lib/customerAuth.ts) is the only source of truth for "am I
// logged in"; this store is just an in-memory cache of GET /api/auth/me,
// refetched on every full page load (see the bootstrap call in
// ConditionalChrome.tsx), the same way CartSync/WishlistSync refresh their
// own stores from the server.
export const useCustomerAuth = create<CustomerAuthState>()((set) => ({
  user: null,
  hydrated: false,
  modalOpen: false,
  modalView: "login",
  setUser: (user) => set({ user, hydrated: true }),
  fetchMe: async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      set({ user: data.user ?? null, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  openModal: (view = "login") => set({ modalOpen: true, modalView: view }),
  closeModal: () => set({ modalOpen: false }),
  setModalView: (view) => set({ modalView: view }),
}));

// Guest-gated actions all funnel through this — opens the modal instead of
// proceeding when logged out, and is a no-op (returns true) when logged in,
// so a caller can write `if (!requireCustomerAuth()) return;` at the top of
// any restricted handler (checkout submit, coupon apply, wishlist add, etc.)
export function requireCustomerAuth(view: AuthModalView = "login"): boolean {
  const { user, openModal } = useCustomerAuth.getState();
  if (user) return true;
  openModal(view);
  return false;
}
