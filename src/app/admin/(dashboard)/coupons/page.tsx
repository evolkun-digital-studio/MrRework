import { redirect } from "next/navigation";

// Superseded by /admin/marketing/discounts (same underlying Coupon model
// and API, extended in place) — kept as a redirect so any existing
// bookmark/link still lands somewhere real instead of a 404.
export default function AdminCouponsRedirect() {
  redirect("/admin/marketing/discounts");
}
