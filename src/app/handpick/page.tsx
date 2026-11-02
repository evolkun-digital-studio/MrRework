import type { Metadata } from "next";
import { HandpickFormEmbed } from "@/components/handpick/HandpickFormEmbed";

export const metadata: Metadata = {
  title: "Premium Vintage Clothing UK | Wholesale & Retail Vintage Fits | MrRework",
  description:
    "Shop premium vintage clothing at MrRework. Explore handpicked denim, jackets, streetwear, wholesale vintage stock, and curated retail fits for UK-style vintage lovers.",
};

export default function HandpickPage() {
  return <HandpickFormEmbed />;
}
