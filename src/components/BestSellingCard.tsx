"use client";
import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";
import { formatConvertedPrice, formatConvertedProductPrice } from "@/lib/utils";
import { useWishlist } from "@/lib/wishlistStore";
import { requireCustomerAuth } from "@/lib/customerAuthStore";
import { useCurrency } from "@/lib/currencyStore";
import type { CardProduct } from "./ProductCard";

// Pixel-match clone of a reference "Best Selling" card — deliberately its
// own component rather than a variant of the shared ProductCard, since the
// reference's layout (bottom-anchored full-body image, no star rating)
// doesn't match. Also used by HomeProductRail (Trending) so both homepage
// rails render identical cards.
export default function BestSellingCard({ product }: { product: CardProduct }) {
  const wishlisted = useWishlist((s) => s.items.some((i) => i.id === product._id));
  const toggleWishlist = useWishlist((s) => s.toggle);
  const { currency, rate } = useCurrency();

  const href = `/product/${product.slug}`;
  const primaryImage = product.images?.[0] ?? product.image;
  const discountPct = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round((1 - product.price / product.compareAtPrice) * 100)
    : null;

  function onToggleWishlist(e: React.MouseEvent) {
    e.preventDefault();
    if (!requireCustomerAuth()) return;
    toggleWishlist({
      id: product._id, slug: product.slug, name: product.name, sku: product.sku ?? "",
      price: product.price, compareAtPrice: product.compareAtPrice, image: primaryImage ?? "",
      collection: product.collection ?? "", colors: product.colors ?? [], sizes: product.sizes ?? [],
      color: product.colors?.[0], available: product.inStock ?? true,
    });
  }

  return (
    <Link href={href} className="group block w-full">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[16px] bg-[#EDECEA]">
        {primaryImage && (
          <Image
            src={primaryImage}
            alt={product.name}
            fill
            sizes="(max-width:768px) 48vw, (max-width:1024px) 24vw, 18vw"
            className="object-cover object-bottom scale-[1.08] transition-transform duration-500 ease-brand group-hover:scale-[1.12]"
          />
        )}

        <button
          type="button"
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
          onClick={onToggleWishlist}
          className="absolute top-[10px] right-[10px] z-20 w-[29px] h-[29px] grid place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(17,17,17,0.15)] text-ink"
        >
          <Heart size={12} className={wishlisted ? "fill-current text-red-500" : ""} />
        </button>
      </div>

      <div className="mt-3">
        <div className="text-[12px] font-medium text-ink truncate">{product.name}</div>
        <div className="mt-1 flex items-center gap-1.5">
          {discountPct !== null ? (
            <>
              <span className="text-[12px] font-semibold text-[#C1392B]">{formatConvertedProductPrice(product, currency, rate)}</span>
              <span className="text-[10px] text-stone line-through">{formatConvertedPrice(product.compareAtPrice!, currency, rate)}</span>
            </>
          ) : (
            <span className="text-[12px] font-semibold text-ink">{formatConvertedProductPrice(product, currency, rate)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
