"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Frame } from "@/components/Frame";
import { useWishlist, type WishlistItem } from "@/lib/wishlistStore";
import { useCart } from "@/lib/store";
import { formatConvertedPrice } from "@/lib/utils";
import { useCurrency } from "@/lib/currencyStore";
import {
  IMAGE_ASPECT, IMAGE_HOVER_ZOOM, BADGE,
  WISHLIST_BUTTON_BASE, WISHLIST_BUTTON_ACTIVE, WISHLIST_ICON_SIZE,
  TITLE_CLASS, BRAND_CLASS, PRICE_CLASS, OLD_PRICE_CLASS,
} from "@/lib/productCardStyle";

export default function WishlistPage() {
  const { items, removeOnAddToCart, setRemoveOnAddToCart } = useWishlist();

  // The persisted wishlist store always renders empty on the server (no
  // localStorage there) — keep the displayed list empty until mounted so the
  // first client render agrees with that empty SSR output (same guard used
  // on the cart/checkout pages, avoids a hydration mismatch).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const displayItems = ready ? items : [];

  if (ready && displayItems.length === 0) {
    return (
      <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh] flex flex-col items-center justify-center text-center">
        <Heart size={48} strokeWidth={1.2} className="text-stone mb-6" />
        <h1 className="display mb-3" style={{ fontSize: "clamp(28px,4vw,48px)" }}>Your wishlist is empty</h1>
        <p className="text-stone mb-8 max-w-[420px]">Save the pieces you love and come back to them anytime.</p>
        <Link href="/shop" className="btn"><span>Continue shopping</span></Link>
      </div>
    );
  }

  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-10">
        <h1 className="display" style={{ fontSize: "clamp(34px,5.5vw,76px)" }}>Wishlist</h1>
        <label className="flex items-center gap-2.5 text-[12px] text-stone cursor-pointer">
          <input
            type="checkbox" checked={removeOnAddToCart}
            onChange={(e) => setRemoveOnAddToCart(e.target.checked)}
            className="w-4 h-4 accent-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          />
          Remove from wishlist when added to bag
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 md:gap-6">
        {displayItems.map((item) => (
          <WishlistCard key={item.id} item={item} removeOnAddToCart={removeOnAddToCart} />
        ))}
      </div>
    </div>
  );
}

function WishlistCard({ item, removeOnAddToCart }: { item: WishlistItem; removeOnAddToCart: boolean }) {
  const remove = useWishlist((s) => s.remove);
  const addToCart = useCart((s) => s.add);
  const { currency, rate } = useCurrency();
  const [size, setSize] = useState(item.size ?? item.sizes[0] ?? "");
  const [color, setColor] = useState(item.color ?? item.colors[0] ?? "");

  function handleAddToCart() {
    addToCart(
      { id: item.id, slug: item.slug, name: item.name, sku: item.sku, price: item.price, image: item.image, size, color },
      1
    );
    if (removeOnAddToCart) remove(item.id);
  }

  return (
    <div className="group flex flex-col">
      <Link href={`/product/${item.slug}`} className={`relative ${IMAGE_ASPECT} overflow-hidden bg-paper-2 block`}>
        <Frame src={item.image} alt={item.name} className={`absolute inset-0 ${IMAGE_HOVER_ZOOM}`} />
        {!item.available && (
          <span className={`absolute top-3 left-3 z-30 ${BADGE}`}>Out of stock</span>
        )}
        {/* Same wishlist-heart affordance every other card uses — every item
            here is by definition wishlisted, so it's always shown active;
            clicking it removes from the wishlist, same underlying action the
            page's old standalone "Remove" link used to trigger. */}
        <button
          type="button"
          aria-label="Remove from wishlist"
          aria-pressed
          onClick={(e) => { e.preventDefault(); remove(item.id); }}
          className={`absolute top-2.5 right-2.5 z-30 ${WISHLIST_BUTTON_BASE} ${WISHLIST_BUTTON_ACTIVE}`}
        >
          <Heart size={WISHLIST_ICON_SIZE} className="fill-current" />
        </button>
      </Link>

      <div className="mt-3">
        <Link href={`/product/${item.slug}`} className={`${TITLE_CLASS} hover:opacity-60 transition`}>{item.name}</Link>
        {item.collection && <div className={`${BRAND_CLASS} mt-1`}>{item.collection}</div>}
        <div className="mt-2 flex items-baseline gap-2">
          <span className={PRICE_CLASS}>{formatConvertedPrice(item.price, currency, rate)}</span>
          {item.compareAtPrice && <span className={OLD_PRICE_CLASS}>{formatConvertedPrice(item.compareAtPrice, currency, rate)}</span>}
        </div>
      </div>

      {item.sizes.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[9px] uppercase tracking-wide text-stone mb-1">Size</div>
          <div className="flex flex-wrap gap-1">
            {item.sizes.map((s) => (
              <button
                key={s} type="button" onClick={() => setSize(s)}
                aria-pressed={size === s}
                className={`text-[10px] font-mono px-2 py-1 border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${size === s ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {item.colors.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[9px] uppercase tracking-wide text-stone mb-1">Colour</div>
          <div className="flex flex-wrap gap-1">
            {item.colors.map((c) => (
              <button
                key={c} type="button" onClick={() => setColor(c)}
                aria-pressed={color === c}
                className={`text-[10px] font-mono px-2 py-1 border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${color === c ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-stone mt-2">Added {new Date(item.addedAt).toLocaleDateString()}</div>

      <button
        type="button" onClick={handleAddToCart} disabled={!item.available}
        className="btn !px-3 !py-2.5 w-full justify-center text-[11px] disabled:opacity-40 mt-3"
      >
        <span>Add to cart</span>
      </button>
    </div>
  );
}
