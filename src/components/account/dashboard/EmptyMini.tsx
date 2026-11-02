"use client";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// Small empty-state used inside dashboard cards/rows — distinct from the
// larger SectionCard-level empty states on the Orders/Addresses/Payment
// Methods pages themselves, which stay untouched.
export default function EmptyMini({
  icon: Icon, text, ctaLabel, ctaHref,
}: { icon: LucideIcon; text: string; ctaLabel?: string; ctaHref?: string }) {
  return (
    <div className="text-center py-4">
      <Icon size={22} strokeWidth={1.3} className="text-stone mx-auto mb-3" aria-hidden="true" />
      <p className="text-[12.5px] text-stone mb-3">{text}</p>
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="text-[11px] uppercase tracking-wide underline hover:text-stone transition">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
