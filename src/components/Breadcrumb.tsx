import Link from "next/link";
import { ChevronRight } from "lucide-react";

// No breadcrumb component existed anywhere in the app before the Retail
// page needed one — this is deliberately generic (an ordered list of
// href/label pairs) so it isn't Retail-specific, in case another section
// wants one later, but nothing else is wired up to use it yet.
export interface BreadcrumbItem {
  label: string;
  href?: string; // omitted (or the last item) renders as plain text, not a link
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center flex-wrap gap-1.5 text-[12px] text-stone mb-6">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} className="shrink-0" aria-hidden />}
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-ink transition-colors">{item.label}</Link>
            ) : (
              <span className={isLast ? "text-ink" : undefined} aria-current={isLast ? "page" : undefined}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
