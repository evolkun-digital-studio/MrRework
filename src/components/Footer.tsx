import Link from "next/link";
import { Instagram, Mail } from "lucide-react";

const cols = [
  { h: "Shop", links: [["Women's","/shop?category=women-s"],["Men's","/shop?category=men-s"],["Unisex","/shop?category=unisex"],["Premium","/shop?category=premium"],["Accessories","/shop?category=accessories"],["All garments","/shop"]] },
  { h: "Company Info", links: [["About Us","/about-us"],["Privacy Policy","/privacy-policy"],["Returns & Refund Policy","/returns-refund-policy"],["Terms & Conditions","/terms-conditions"]] },
];

export default function Footer() {
  return (
    <footer className="bg-white text-ink border-t border-line px-5 md:px-12 pt-20 pb-10">
      <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr] gap-10 md:gap-12">
        <div className="col-span-2 md:col-span-1">
          <div className="font-display leading-[0.85] tracking-tight" style={{ fontWeight: 800, fontSize: "clamp(40px,7vw,84px)" }}>MrRework</div>
          <p className="text-[13.5px] mt-5 max-w-[300px] text-stone">
            Considered garments, made slowly in limited runs. Antwerp, est. 2018.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            {/* h2, not h4 — the footer is a landmark whose columns are top-
                level sections in their own right, not nested under some
                other page heading, so h4 skipped straight past h2/h3 on
                every page (footer appears at the very end, after whatever
                heading depth the page's own content used). h2 can never
                skip a level here since it's one down from the page's own h1. */}
            <h2 className="font-mono text-[11px] tracking-[0.12em] uppercase mb-4 text-stone">{c.h}</h2>
            {c.links.map(([label, href]) => (
              <Link key={label} href={href} className="block text-[14px] py-1.5 text-ink-2 transition hover:text-ink hover:translate-x-0.5">{label}</Link>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 mt-16 pt-6 border-t border-line">
        <span className="font-mono text-[11px] tracking-wide text-stone">© 2026 MRREWORK. ALL RIGHTS RESERVED.</span>
        <span className="font-mono text-[11px] tracking-wide text-stone">Privacy · Terms · Cookies</span>
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full border border-line grid place-items-center text-ink-2 hover:border-ink hover:text-ink transition" aria-label="Instagram">
            <Instagram size={15} />
          </span>
          <span className="font-mono text-[11px] tracking-wide text-stone">Pinterest</span>
          <span className="w-9 h-9 rounded-full border border-line grid place-items-center text-ink-2 hover:border-ink hover:text-ink transition" aria-label="Newsletter">
            <Mail size={15} />
          </span>
        </div>
      </div>
    </footer>
  );
}
