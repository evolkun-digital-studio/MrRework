export interface ProductVariant {
  size: string; color: string; stock: number; sku: string;
  regularPrice?: number; salePrice?: number; effectivePrice?: number;
  attributes?: Record<string, string>;
}

export interface Product {
  _id: string;
  name: string; slug: string; sku: string;
  description: string; materials: string;
  category: string; collection: string;
  gender: "men" | "women" | "unisex";
  price: number; compareAtPrice?: number; priceMax?: number; currency: string;
  images: string[]; hoverImage?: string;
  colors: string[]; sizes: string[]; variants: ProductVariant[];
  rating: number; reviewCount: number; tags: string[];
  isNew: boolean; isLimited: boolean; isBestSeller: boolean; inStock: boolean;
  isPreOrder?: boolean; saleEndsAt?: string;
  stock?: number;
  // Optional (not required here, unlike the Mongoose schema's own
  // `default: "shop"`) since every product that existed before this field
  // was added has none stored — see productTypeFilter() in
  // src/lib/search.ts, which treats a missing value the same as "shop".
  productType?: "shop" | "retail";
  createdAt: string;
}

export interface Category { _id: string; name: string; slug: string; description?: string; image?: string; count?: number; }

export interface ShopByCategoryItem { categorySlug: string; customImage?: string; enabled: boolean; displayOrder: number; }
export interface ShopByCategorySection { _id?: string; enabled: boolean; title: string; subtitle: string; categories: ShopByCategoryItem[]; }
export interface ShopByCategoryCard extends Category { image: string; }

export interface PromoBanner {
  _id: string;
  title: string; subtitle?: string;
  buttonText: string; buttonLink: string;
  desktopImage: string; mobileImage?: string;
  overlayOpacity: number;
  order: number; isActive: boolean;
}

export interface FeaturedReview {
  _id: string;
  author: string; rating: number; body?: string;
  verified: boolean; photo?: string;
  product?: { _id: string; name: string; slug: string; price: number; priceMax?: number; images?: string[] };
}

export interface ShopTheLookHotspot {
  _id: string;
  x: number; y: number;
  product?: { _id: string; name: string; slug: string; price: number; priceMax?: number; images?: string[]; rating?: number };
}

export interface ShopTheLook {
  _id: string;
  image: string; mobileImage?: string;
  order: number; isActive: boolean;
  hotspots: ShopTheLookHotspot[];
}

export interface PromoMediaItem {
  _id: string;
  type: "image" | "video";
  url: string;
  order: number;
  isActive: boolean;
}

export interface LuxuryPromoCardData {
  eyebrow: string;
  heading: string;
  image: string;
  imageAlt?: string;
  objectPosition?: string;
}

export interface LuxuryPromoSectionData {
  left: LuxuryPromoCardData;
  right: LuxuryPromoCardData;
}

export interface HomepageCollectionSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  limit: number;
  mode: "automatic" | "manual";
  productIds: string[];
  ctaEnabled: boolean;
  ctaText: string;
  ctaHref: string;
}

export interface HomepageCollectionsData {
  latestDrops: HomepageCollectionSettings;
  bestSelling: HomepageCollectionSettings;
  trending: HomepageCollectionSettings;
}

export interface OrderItem {
  product: string; name: string; sku: string; size: string; color: string;
  price: number; quantity: number; image: string;
}

export interface Order {
  _id: string; orderNumber: string; email: string;
  items: OrderItem[];
  subtotal: number; shipping: number; tax: number; discount: number; total: number;
  shippingMethod: "standard" | "express" | "pickup";
  coupon?: string;
  shippingAddress: Record<string, unknown>;
  billingAddress: Record<string, unknown>;
  paymentMethod: "stripe" | "paypal" | "card" | "upi";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  fulfillmentStatus: "unfulfilled" | "processing" | "shipped" | "delivered";
  trackingNumber?: string;
  trackingUrl?: string;
  createdAt: string;
}

export interface BlogPost {
  _id: string;
  title: string; slug: string; excerpt: string; content: string;
  featuredImage?: string; authorName?: string;
  categories: string[]; tags: string[];
  status: "draft" | "scheduled" | "published"; visibility: "public" | "private" | "password-protected";
  publishedAt?: string; createdAt: string;
  seoTitle?: string; seoDescription?: string; canonicalUrl?: string; robots?: string;
  ogTitle?: string; ogDescription?: string; ogImage?: string;
  twitterTitle?: string; twitterDescription?: string; twitterImage?: string;
}

export interface Page {
  _id: string;
  title: string; slug: string; excerpt: string; content: string;
  featuredImage?: string; authorName?: string;
  status: "draft" | "scheduled" | "published"; visibility: "public" | "private" | "password-protected";
  publishedAt?: string; createdAt: string;
  seoTitle?: string; seoDescription?: string; canonicalUrl?: string; robots?: string;
  ogTitle?: string; ogDescription?: string; ogImage?: string;
  twitterTitle?: string; twitterDescription?: string; twitterImage?: string;
}

export interface ProductQuery {
  category?: string; collection?: string; gender?: string;
  color?: string; size?: string; minPrice?: number; maxPrice?: number;
  isNew?: boolean; isBestSeller?: boolean; inStock?: boolean; tags?: string[];
  sort?: "newest" | "price-asc" | "price-desc" | "popularity" | "best-selling";
  page?: number; limit?: number; q?: string;
}
