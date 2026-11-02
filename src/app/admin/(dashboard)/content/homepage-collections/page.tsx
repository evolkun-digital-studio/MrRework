"use client";
import { useEffect, useState } from "react";
import { Card, Input, Textarea, Select, Button, Banner } from "@/components/admin/ui";

interface PreviewProduct {
  _id: string;
  name: string;
  sku: string;
  image: string;
}

interface SectionForm {
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  limit: number;
  mode: "automatic" | "manual";
  productIds: string; // comma-separated, same convention as Marketing -> Discounts' product-ID fields
  ctaEnabled: boolean;
  ctaText: string;
  ctaHref: string;
}

const EMPTY_SECTION: SectionForm = {
  enabled: true, title: "", subtitle: "", description: "", limit: 10,
  mode: "automatic", productIds: "", ctaEnabled: true, ctaText: "View Products", ctaHref: "",
};

const TABS = [
  { key: "latestDrops" as const, label: "Latest Drops", flag: "isNew", page: "/latest-drops", hasRail: false },
  { key: "bestSelling" as const, label: "Best Selling", flag: "isBestSeller", page: "/bestsellers", hasRail: true },
  { key: "trending" as const, label: "Trending", flag: "isTrending", page: "/trending", hasRail: true },
];

function toForm(section: any): SectionForm {
  return {
    ...EMPTY_SECTION,
    ...section,
    productIds: (section?.productIds ?? []).join(", "),
  };
}

function toPayload(form: SectionForm) {
  return {
    ...form,
    productIds: form.productIds.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export default function AdminHomepageCollectionsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("latestDrops");
  const [forms, setForms] = useState<Record<string, SectionForm> | null>(null);
  const [previews, setPreviews] = useState<Record<string, PreviewProduct[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function load() {
    fetch("/api/admin/homepage-collections")
      .then((res) => res.json())
      .then((data) => {
        setForms({
          latestDrops: toForm(data.settings?.latestDrops),
          bestSelling: toForm(data.settings?.bestSelling),
          trending: toForm(data.settings?.trending),
        });
        setPreviews(data.previews ?? {});
      });
  }
  useEffect(load, []);

  function updateTab(key: string, patch: Partial<SectionForm>) {
    setForms((f) => (f ? { ...f, [key]: { ...f[key], ...patch } } : f));
  }

  async function save() {
    if (!forms) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/homepage-collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latestDrops: toPayload(forms.latestDrops),
          bestSelling: toPayload(forms.bestSelling),
          trending: toPayload(forms.trending),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
      load(); // refresh the "currently showing" preview against the just-saved settings
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const activeTab = TABS.find((t) => t.key === tab)!;
  const form = forms?.[tab];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Homepage Collections</h1>
        <p className="text-[12.5px] text-stone mt-1">Latest Drops, Best Selling, and Trending — each backed by its own product flag and dedicated collection page.</p>
      </div>

      <div className="flex gap-1 border-b border-line dark:border-[#332e26]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition ${
              tab === t.key ? "border-ink dark:border-[#f3efe8] text-ink dark:text-[#f3efe8]" : "border-transparent text-stone hover:text-ink dark:hover:text-[#f3efe8]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!form ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
      ) : (
        <Card>
          <div className="space-y-4 max-w-lg">
            <p className="text-[12px] text-stone">
              Automatic products are matched by the <code>{activeTab.flag}</code> flag on Product (set per-product in Admin -&gt; Products). Dedicated page: <code>{activeTab.page}</code>.
              {!activeTab.hasRail && " This section has no homepage rail — these fields only affect the dedicated page's heading."}
            </p>

            {activeTab.hasRail && (
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-stone mb-1.5">
                  Currently showing on this rail ({previews[tab]?.length ?? 0})
                </span>
                {!previews[tab]?.length ? (
                  <p className="text-[12px] text-stone">No products resolve to this section right now — nothing has the <code>{activeTab.flag}</code> flag set, and no manual products are selected.</p>
                ) : (
                  <>
                    <ul className="border border-line dark:border-[#332e26] rounded-brand divide-y divide-line dark:divide-[#332e26] max-h-56 overflow-y-auto">
                      {previews[tab].map((p) => (
                        <li key={p._id} className="flex items-center gap-2.5 px-3 py-2">
                          <div className="w-9 h-9 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                            {p.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.image} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12.5px] truncate">{p.name}</div>
                            <div className="text-[11px] text-stone font-mono">{p.sku}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {form.mode === "automatic" && (
                      <Button
                        type="button" variant="ghost" size="sm" className="mt-2"
                        onClick={() => updateTab(tab, { mode: "manual", productIds: previews[tab].map((p) => p._id).join(", ") })}
                      >
                        Lock in these products (switch to manual)
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={(e) => updateTab(tab, { enabled: e.target.checked })} className="w-4 h-4 accent-[var(--ink)]" />
              Enabled{activeTab.hasRail ? " (visible on the homepage)" : ""}
            </label>

            <Input label="Title" value={form.title} onChange={(e) => updateTab(tab, { title: e.target.value })} />
            <Input label="Subtitle" value={form.subtitle} onChange={(e) => updateTab(tab, { subtitle: e.target.value })} />
            <Textarea label="Description (optional)" rows={2} value={form.description} onChange={(e) => updateTab(tab, { description: e.target.value })} />

            {activeTab.hasRail && (
              <>
                <Input
                  label="Homepage rail product limit" type="number" min={1} max={20}
                  value={form.limit} onChange={(e) => updateTab(tab, { limit: Number(e.target.value) })}
                />
                <Select
                  label="Homepage rail mode"
                  value={form.mode}
                  onChange={(e) => updateTab(tab, { mode: e.target.value as "automatic" | "manual" })}
                  options={[
                    { value: "automatic", label: `Automatic (newest ${activeTab.flag} products)` },
                    { value: "manual", label: "Manual (choose specific products)" },
                  ]}
                />
                {form.mode === "manual" && (
                  <Input
                    label="Product IDs (comma-separated)" placeholder="507f1f77bcf86cd799439011, …"
                    value={form.productIds} onChange={(e) => updateTab(tab, { productIds: e.target.value })}
                  />
                )}
              </>
            )}

            <div className="pt-2 border-t border-line dark:border-[#332e26] space-y-3">
              <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" checked={form.ctaEnabled} onChange={(e) => updateTab(tab, { ctaEnabled: e.target.checked })} className="w-4 h-4 accent-[var(--ink)]" />
                Show "View Products" button{activeTab.hasRail ? "" : " (n/a — no homepage rail)"}
              </label>
              <Input label="Button text" value={form.ctaText} onChange={(e) => updateTab(tab, { ctaText: e.target.value })} />
              <Input label="Button destination" placeholder={activeTab.page} value={form.ctaHref} onChange={(e) => updateTab(tab, { ctaHref: e.target.value })} />
            </div>

            {error && <Banner tone="error">{error}</Banner>}
            {saved && !error && <Banner>Saved.</Banner>}
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
