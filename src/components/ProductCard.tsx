"use client";
import { useState } from "react";
import Link from "next/link";
import { Heart, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { Frame } from "./Frame";
import { formatConvertedPrice, formatConvertedProductPrice } from "@/lib/utils";
import { useCart } from "@/lib/store";
import { useWishlist } from "@/lib/wishlistStore";
import { requireCustomerAuth } from "@/lib/customerAuthStore";
import { useCategoryName } from "@/lib/categoryStore";
import { useCurrency } from "@/lib/currencyStore";
import {
  IMAGE_ASPECT, IMAGE_HOVER_ZOOM, BADGE,
  WISHLIST_BUTTON_BASE, WISHLIST_BUTTON_ACTIVE, WISHLIST_ICON_SIZE, QUICK_ADD_BUTTON_BASE,
  CAPTION_HEIGHT, CAPTION_TEXT, BRAND_CLASS, TITLE_CLASS, PRICE_CLASS, OLD_PRICE_CLASS, DISCOUNT_CLASS,
} from "@/lib/productCardStyle";

// The one product card used everywhere on the storefront (shop grid, search
// results page, search overlay, PDP related products, homepage rails,
// account dashboard rows) — a single superset shape covers both the full
// `Product` record (images[], sizes/colors/category, per-size quick add)
// and the leaner `CompactProduct` search uses (single image, no size/colour
// data — /api/search deliberately doesn't return it, so quick-add for those
// falls back to fetching the full record by slug on demand, same as this
// component's previous search-specific variant did).
export interface CardProduct {
  _id: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  priceMax?: number;
  images?: string[];
  image?: string;
  hoverImage?: string;
  category?: string;
  collection?: string;
  colors?: string[];
  sizes?: string[];
  sku?: string;
  inStock?: boolean;
  isNew?: boolean;
  isLimited?: boolean;
  isBestSeller?: boolean;
  isPreOrder?: boolean;
  saleEndsAt?: string;
}

export default function ProductCard({
  product, index = 0, id, active, onNavigate, onHover,
}: {
  product: CardProduct;
  index?: number;
  /** Listbox wiring for the search overlay's keyboard-navigable results grid — no-ops everywhere else. */
  id?: string;
  active?: boolean;
  onNavigate?: () => void;
  onHover?: () => void;
}) {
  const add = useCart((s) => s.add);
  const wishlisted = useWishlist((s) => s.items.some((i) => i.id === product._id));
  const toggleWishlist = useWishlist((s) => s.toggle);
  const resolvedCategoryName = useCategoryName(product.category ?? "");
  const { currency, rate } = useCurrency();
  const [quickAddStatus, setQuickAddStatus] = useState<"idle" | "adding" | "added">("idle");

  const href = `/product/${product.slug}`;
  const primaryImage = product.images?.[0] ?? product.image;
  const hoverImage = product.hoverImage ?? product.images?.[1];
  const brandLabel = product.category ? resolvedCategoryName : (product.collection ?? "");
  const inStock = product.inStock ?? true;
  const hasSizes = (product.sizes?.length ?? 0) > 0;

  const discountPct = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round((1 - product.price / product.compareAtPrice) * 100)
    : null;
  // Only "Sold Out" gets an on-image badge now — New/Sale/Bestseller/Limited
  // pills are dropped to match the reference grid, which conveys a discount
  // via the price row (old price + -pct%) instead of a corner label.
  const badgeText = !inStock ? "Sold Out" : null;
  const badgeColor = "bg-[#C92A2A] text-white";

  function onToggleWishlist(e: React.MouseEvent) {
    e.preventDefault();
    if (!requireCustomerAuth()) return;
    toggleWishlist({
      id: product._id, slug: product.slug, name: product.name, sku: product.sku ?? "",
      price: product.price, compareAtPrice: product.compareAtPrice, image: primaryImage ?? "",
      collection: product.collection ?? "", colors: product.colors ?? [], sizes: product.sizes ?? [],
      color: product.colors?.[0], available: inStock,
    });
  }

  // Icon-only quick add — always adds the first available size/colour
  // rather than surfacing a size picker. When the record already carries
  // size/colour data (every full `Product` context: shop, search page, PDP,
  // homepage) that's used directly; the search overlay's compact shape has
  // neither, so it fetches the full record by slug on demand first, same as
  // this component's previous search-specific quick-add path did.
  async function quickAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (quickAddStatus !== "idle" || !inStock) return;
    setQuickAddStatus("adding");
    try {
      let size = product.sizes?.[0] ?? "";
      let color = product.colors?.[0] ?? "";
      if (!hasSizes) {
        const res = await fetch(`/api/products/${product.slug}`);
        const data = await res.json();
        if (!data.product) throw new Error("not found");
        size = data.product.sizes?.[0] ?? "";
        color = data.product.colors?.[0] ?? "";
      }
      add({
        id: product._id, slug: product.slug, name: product.name, sku: product.sku ?? "",
        price: product.price, image: primaryImage ?? "", size, color,
      });
      setQuickAddStatus("added");
      setTimeout(() => setQuickAddStatus("idle"), 1600);
    } catch {
      setQuickAddStatus("idle");
    }
  }

  return (
    <motion.div
      id={id}
      role={id ? "option" : undefined}
      aria-selected={id ? !!active : undefined}
      onMouseEnter={onHover}
      initial={{ y: 40, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: (index % 4) * 0.06 }}
      className="group relative"
    >
      <Link href={href} onClick={onNavigate} className={`relative block ${IMAGE_ASPECT} overflow-hidden bg-[#F3F3F3]`}>
        {badgeText && <span className={`absolute top-3 left-3 z-30 ${BADGE} ${badgeColor}`}>{badgeText}</span>}

        <Frame src={primaryImage} alt={product.name} className={`absolute inset-0 ${IMAGE_HOVER_ZOOM} ${hoverImage ? "group-hover:opacity-0" : ""}`} />
        {hoverImage && (
          <Frame src={hoverImage} alt={`${product.name} alternate`} className={`absolute inset-0 opacity-0 ${IMAGE_HOVER_ZOOM} group-hover:opacity-100`} showLoadingState={false} />
        )}

        <button
          type="button"
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
          onClick={onToggleWishlist}
          className={`absolute top-2 right-2 z-30 ${WISHLIST_BUTTON_BASE} ${wishlisted ? WISHLIST_BUTTON_ACTIVE : ""}`}
        >
          <Heart size={WISHLIST_ICON_SIZE} className={wishlisted ? "fill-current" : ""} />
        </button>

        {/* Quick-add stays a hover-only affordance (not shown in the
            reference grid at rest) — see QUICK_ADD_BUTTON_BASE in
            productCardStyle.ts. Always adds the first available
            size/colour (see quickAdd above); there's no room in this
            icon-only affordance for a size picker. */}
        <button
          type="button"
          aria-label={quickAddStatus === "added" ? "Added to bag" : !inStock ? "Sold out" : "Add to bag"}
          onClick={quickAdd}
          disabled={!inStock || quickAddStatus !== "idle"}
          className={`absolute top-11 right-2 z-30 ${QUICK_ADD_BUTTON_BASE}`}
        >
          <ShoppingBag size={WISHLIST_ICON_SIZE} className={!inStock ? "text-stone" : quickAddStatus === "added" ? "fill-current" : ""} />
        </button>
      </Link>

      {/* Caption — always visible, no hover-reveal (see productCardStyle.ts).
          Price-first ordering with an inline old-price + -pct% discount,
          matching the reference grid's layout. */}
      <div className={CAPTION_HEIGHT}>
        <div className={CAPTION_TEXT}>
          <div className="flex items-baseline gap-1.5">
            <span className={PRICE_CLASS}>{formatConvertedProductPrice(product, currency, rate)}</span>
            {discountPct !== null && (
              <>
                <span className={OLD_PRICE_CLASS}>{formatConvertedPrice(product.compareAtPrice!, currency, rate)}</span>
                <span className={DISCOUNT_CLASS}>-{discountPct}%</span>
              </>
            )}
          </div>
          <Link href={href} onClick={onNavigate} className={TITLE_CLASS}>
            {product.name}
          </Link>
          {brandLabel && <div className={BRAND_CLASS}>{brandLabel}</div>}
        </div>
      </div>
    </motion.div>
  );
}
