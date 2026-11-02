"use client";
import { memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface SummaryCardProps {
  icon: LucideIcon;
  title: string;
  href?: string;
  onClick?: () => void;
  badge?: string;
}

const TILE_CLASS =
  "relative flex flex-col items-center justify-center gap-4 border border-line rounded-brand bg-paper px-6 py-10 text-center w-full hover:shadow-[0_14px_32px_rgba(21,18,14,0.07)] transition-shadow";

// Simple centered icon + label tile — matches the reference "Orders /
// Addresses / Payment methods / Account details / Wishlist / Logout" grid:
// no counts, no subtext, no empty states, the whole card is one big link
// (or, for Logout, a button that behaves the same visually).
function SummaryCard({ icon: Icon, title, href, onClick, badge }: SummaryCardProps) {
  const content = (
    <>
      {badge && (
        <span className="absolute top-4 right-4 text-[9.5px] uppercase tracking-wide border border-line rounded-brand px-2 py-1 text-stone">
          {badge}
        </span>
      )}
      <Icon size={34} strokeWidth={1.3} className="text-stone" aria-hidden="true" />
      <span className="font-medium text-[15px] text-ink">{title}</span>
    </>
  );

  return (
    <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      {href ? (
        <Link href={href} className={TILE_CLASS}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={TILE_CLASS}>
          {content}
        </button>
      )}
    </motion.div>
  );
}

export default memo(SummaryCard);
