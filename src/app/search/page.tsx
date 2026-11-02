import { Suspense } from "react";
import type { Metadata } from "next";
import SearchResults from "@/components/SearchResults";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]" />}>
      <SearchResults />
    </Suspense>
  );
}
