"use client";
import { use, useEffect, useState } from "react";
import BlogForm, { type BlogFormValues } from "@/components/admin/BlogForm";

export default function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [post, setPost] = useState<BlogFormValues | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/blog/${id}`).then(async (res) => {
      const data = await res.json();
      if (!res.ok) { setNotFound(true); return; }
      setPost({ ...data.post, publishedAt: data.post.publishedAt ? String(data.post.publishedAt).slice(0, 16) : "" });
    }).catch(() => setNotFound(true));
  }, [id]);

  if (notFound) return <p className="text-[13px] text-stone">Post not found.</p>;
  if (!post) return <div className="h-64 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">{post.title}</h1>
      </div>
      <BlogForm initial={post} postId={id} />
    </div>
  );
}
