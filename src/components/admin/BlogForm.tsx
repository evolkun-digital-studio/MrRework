"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Plus, X } from "lucide-react";
import { Card, Input, Textarea, Select, Button, Banner } from "@/components/admin/ui";
import MediaPicker from "@/components/admin/MediaPicker";

export interface BlogFormValues {
  title: string; slug: string; excerpt: string; content: string; featuredImage: string;
  categories: string[]; tags: string[]; status: "draft" | "scheduled" | "published";
  publishedAt?: string; seoTitle: string; seoDescription: string;
}

const EMPTY: BlogFormValues = {
  title: "", slug: "", excerpt: "", content: "", featuredImage: "",
  categories: [], tags: [], status: "draft", publishedAt: "", seoTitle: "", seoDescription: "",
};
const csv = (arr: string[]) => arr.join(", ");
const parseCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function BlogForm({ initial, postId }: { initial?: Partial<BlogFormValues>; postId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<BlogFormValues>({ ...EMPTY, ...initial });
  const [preview, setPreview] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof BlogFormValues>(k: K, v: BlogFormValues[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(postId ? `/api/admin/blog/${postId}` : "/api/admin/blog", {
        method: postId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save post.");
      router.push(`/admin/blog/${data.post._id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="space-y-3">
              <Input label="Title" required value={form.title} onChange={(e) => update("title", e.target.value)} />
              <Input label="Slug" required value={form.slug} onChange={(e) => update("slug", e.target.value)} />
              <Textarea label="Excerpt" rows={2} value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)} />
            </div>
          </Card>

          <Card
            title="Content"
            action={
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
                {preview ? <><Pencil size={13} /> Edit</> : <><Eye size={13} /> Preview</>}
              </Button>
            }
          >
            {preview ? (
              <div className="prose-sm max-w-none text-[13.5px] leading-relaxed space-y-3">
                {form.content.split(/\n{2,}/).filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
                {!form.content && <p className="text-stone">Nothing to preview yet.</p>}
              </div>
            ) : (
              <textarea
                value={form.content} onChange={(e) => update("content", e.target.value)} rows={16}
                placeholder="Write in plain text or basic Markdown — separate paragraphs with a blank line."
                className="w-full bg-transparent border border-line dark:border-[#332e26] rounded-brand px-3 py-2 text-[13px] font-mono outline-none focus:border-ink dark:focus:border-[#f3efe8]"
              />
            )}
          </Card>

          <Card title="Search engine optimisation">
            <div className="space-y-3">
              <Input label="SEO title" value={form.seoTitle} onChange={(e) => update("seoTitle", e.target.value)} />
              <Textarea label="SEO description" rows={2} value={form.seoDescription} onChange={(e) => update("seoDescription", e.target.value)} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Publish">
            <div className="space-y-3">
              <Select
                label="Status" value={form.status} onChange={(e) => update("status", e.target.value as BlogFormValues["status"])}
                options={[{ value: "draft", label: "Draft" }, { value: "scheduled", label: "Scheduled" }, { value: "published", label: "Published" }]}
              />
              {form.status === "scheduled" && (
                <Input label="Publish date" type="datetime-local" value={form.publishedAt ?? ""} onChange={(e) => update("publishedAt", e.target.value)} />
              )}
              <Button type="submit" disabled={saving} className="w-full justify-center">{saving ? "Saving…" : "Save"}</Button>
            </div>
          </Card>

          <Card title="Featured image" action={<Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(true)}><Plus size={13} /> Choose</Button>}>
            {form.featuredImage ? (
              <div className="relative aspect-video rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.featuredImage} alt="Featured image preview" className="w-full h-full object-cover" />
                <button type="button" onClick={() => update("featuredImage", "")} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <p className="text-[12.5px] text-stone">No featured image selected.</p>
            )}
            <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(url) => { update("featuredImage", url); setPickerOpen(false); }} />
          </Card>

          <Card title="Organisation">
            <div className="space-y-3">
              <Input label="Categories (comma separated)" value={csv(form.categories)} onChange={(e) => update("categories", parseCsv(e.target.value))} />
              <Input label="Tags (comma separated)" value={csv(form.tags)} onChange={(e) => update("tags", parseCsv(e.target.value))} />
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}
