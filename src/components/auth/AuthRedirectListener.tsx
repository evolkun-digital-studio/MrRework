"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomerAuth } from "@/lib/customerAuthStore";

// A guest hitting a login-gated page directly (e.g. a bookmarked /account
// URL) gets bounced home with ?authRequired=1 by that page's own server-side
// redirect (see src/app/account/layout.tsx) — there's no dedicated login
// page to redirect to instead, per the "modal, not redirect" requirement.
// This picks that marker up on the client, opens the same login modal every
// other guest-gated action uses, and strips the param so a refresh doesn't
// reopen it.
export default function AuthRedirectListener() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("authRequired")) {
      useCustomerAuth.getState().openModal("login");
      router.replace("/");
    }
  }, [router]);

  return null;
}
