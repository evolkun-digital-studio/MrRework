"use client";
import Link from "next/link";
import Image from "next/image";
import type { ShopByCategoryCard } from "@/lib/types";

const SECTION_PADDING_CLASS = "px-5 md:px-10 lg:px-16 xl:px-24";

function sentenceCase(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

export function ShopByCategory({ title, subtitle, categories }: { title: string; subtitle: string; categories: ShopByCategoryCard[] }) {
  if (categories.length === 0) return null;

  return (
    <div>
      <div className={`text-center mb-10 md:mb-14 ${SECTION_PADDING_CLASS}`}>
        <h2 className="font-display" style={{ fontWeight: 700, fontSize: "clamp(26px,3vw,40px)", letterSpacing: "-0.01em" }}>
          {title}
        </h2>
        <p className="mt-3 text-[14px] md:text-[15px] text-ink-2">{subtitle}</p>
      </div>

      <div className={`flex flex-wrap justify-center gap-4 md:gap-6 ${SECTION_PADDING_CLASS}`}>
        {categories.map((cat) => (
          <Link key={cat._id} href={`/shop?category=${cat.slug}`} className="group shrink-0 w-[calc((100%-16px)/2)] sm:w-[calc((100%-2*24px)/3)] lg:w-[calc((100%-3*24px)/4)] xl:w-[calc((100%-4*24px)/5)]">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-paper-2">
              <Image src={cat.image} alt={cat.name} fill sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, (max-width:1280px) 25vw, 20vw" className="object-cover transition-transform duration-500 ease-brand group-hover:scale-[1.05]" />
            </div>
            <div className="mt-3.5 text-center font-display text-[16px] md:text-[18px] font-semibold text-ink">{sentenceCase(cat.name)}</div>
            <div className="mt-1 text-center text-[12px] text-ink-2">{cat.count} Products</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
