"use client";
import { use, useEffect, useState } from "react";
import ProductForm, { type ProductFormValues } from "@/components/admin/ProductForm";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<ProductFormValues | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/products/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) { setNotFound(true); return; }
        setProduct(data.product);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) return <p className="text-[13px] text-stone">Product not found.</p>;
  if (!product) return <div className="h-64 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">{product.name}</h1>
        <p className="text-[12.5px] text-stone mt-1 font-mono">{product.sku}</p>
      </div>
      <ProductForm initial={product} productId={id} />
    </div>
  );
}
