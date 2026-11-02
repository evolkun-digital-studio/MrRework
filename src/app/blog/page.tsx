import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedBlogPosts } from "@/lib/data";
import { Frame } from "@/components/Frame";
import { SITE_URL } from "@/lib/utils";

const description = "Stories on craft, materials, and the making of considered garments, from the MrRework journal.";

export const metadata: Metadata = {
  title: "Journal",
  description,
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: { title: "Journal", description, url: `${SITE_URL}/blog`, siteName: "MrRework", type: "website" },
  twitter: { card: "summary_large_image", title: "Journal", description },
};

export default async function BlogIndexPage() {
  const posts = await getPublishedBlogPosts();

  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]">
      <h1 className="display mb-10" style={{ fontSize: "clamp(34px,5.5vw,76px)" }}>Journal</h1>
      {!posts.length ? (
        <p className="text-stone">No posts yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
          {posts.map((post) => (
            <Link key={post._id} href={`/blog/${post.slug}`} className="group block">
              <div className="relative w-full aspect-[4/5] rounded-brand overflow-hidden bg-paper-2 mb-4">
                <Frame src={post.featuredImage} alt={post.title} />
              </div>
              {post.categories?.length > 0 && (
                <div className="font-mono text-[11px] text-stone mb-2 uppercase tracking-wide">{post.categories.join(" · ")}</div>
              )}
              <h2 className="text-[17px] font-medium leading-snug group-hover:underline">{post.title}</h2>
              {post.excerpt && <p className="text-stone text-[14px] mt-2 line-clamp-2">{post.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
