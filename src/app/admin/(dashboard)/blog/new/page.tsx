import BlogForm from "@/components/admin/BlogForm";

export default function NewBlogPostPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">New post</h1>
        <p className="text-[12.5px] text-stone mt-1">Saved as a draft until you publish it.</p>
      </div>
      <BlogForm />
    </div>
  );
}
