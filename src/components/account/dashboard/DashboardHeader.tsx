"use client";
import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";
import type { SafeUser } from "@/lib/account";

export default function DashboardHeader({ account }: { account: SafeUser }) {
  const displayName = [account.firstName, account.lastName].filter(Boolean).join(" ") || "there";

  return (
    <section aria-labelledby="dashboard-welcome" className="flex items-center justify-between gap-5 border-b border-line pb-8">
      <div className="flex items-center gap-5 min-w-0">
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-paper-2 overflow-hidden grid place-items-center shrink-0">
          {account.profileImage ? (
            <Image src={account.profileImage} alt={`${displayName}'s profile photo`} fill sizes="80px" className="object-cover" />
          ) : (
            <User size={28} className="text-stone" />
          )}
        </div>

        <div className="min-w-0">
          <span className="eyebrow">Welcome back</span>
          <h2 id="dashboard-welcome" className="display mt-1 truncate" style={{ fontSize: "clamp(24px,3.4vw,40px)" }}>
            {displayName}
          </h2>
        </div>
      </div>

      <Link
        href="/account/profile"
        className="hidden sm:inline-flex shrink-0 text-[11px] uppercase tracking-wide underline hover:text-stone transition"
      >
        Edit profile
      </Link>
    </section>
  );
}
