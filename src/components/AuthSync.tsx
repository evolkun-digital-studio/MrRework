"use client";
import { useEffect } from "react";
import { useCustomerAuth } from "@/lib/customerAuthStore";

// Mounted once in the root chrome — bootstraps "is a customer logged in"
// client-side state from the httpOnly session cookie via GET /api/auth/me.
// Mirrors CartSync/WishlistSync's mount-once-and-hydrate pattern.
export default function AuthSync() {
  useEffect(() => {
    useCustomerAuth.getState().fetchMe();
  }, []);

  return null;
}
