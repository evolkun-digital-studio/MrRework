"use client";
import { createContext, useCallback, useContext, useState } from "react";
import type { SafeUser } from "@/lib/account";

interface AccountContextValue {
  account: SafeUser;
  refresh: () => Promise<void>;
  setAccount: (u: SafeUser) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

// Seeded once from the server (see src/app/account/layout.tsx) so section
// pages never need a loading spinner just to show the account shell — after
// that, mutations (profile edits, address CRUD, etc.) update this in place
// via each page's own API calls rather than a full refetch.
export function AccountProvider({ initial, children }: { initial: SafeUser; children: React.ReactNode }) {
  const [account, setAccount] = useState<SafeUser>(initial);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/account");
    if (res.ok) setAccount(await res.json());
  }, []);

  return <AccountContext.Provider value={{ account, refresh, setAccount }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}
