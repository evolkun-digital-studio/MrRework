"use client";
import { usePathname } from "next/navigation";
import SmoothScroll from "@/app/smooth-scroll";
import Header from "./Header";
import Footer from "./Footer";
import CartDrawer from "./CartDrawer";
import CartSync from "./CartSync";
import WishlistSync from "./WishlistSync";
import AuthSync from "./AuthSync";
import AuthModal from "./auth/AuthModal";
import AuthRedirectListener from "./auth/AuthRedirectListener";
import LoginReminderModal from "./auth/LoginReminderModal";

// The Admin CMS must never reuse any storefront chrome (Header, Footer,
// cart UI) — rather than restructure the whole app into separate root
// layouts (a large, risky file-move given every existing page lives at the
// app root today), this keeps the single shared <html>/<body> shell and
// just skips mounting storefront chrome for /admin/* routes. Admin routes
// provide their own complete shell (see src/app/admin/**/layout.tsx).
export default function ConditionalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/admin")) return <>{children}</>;

  return (
    <SmoothScroll>
      <CartSync />
      <WishlistSync />
      <AuthSync />
      <AuthRedirectListener />
      <Header />
      <CartDrawer />
      <AuthModal />
      <LoginReminderModal />
      <main>{children}</main>
      <Footer />
    </SmoothScroll>
  );
}
