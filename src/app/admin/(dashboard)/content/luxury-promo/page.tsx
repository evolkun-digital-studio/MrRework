"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card, Input, Button, Banner } from "@/components/admin/ui";
import MediaPicker from "@/components/admin/MediaPicker";

interface LuxuryPromoCard {
  eyebrow: string;
  heading: string;
  image: string;
  imageAlt: string;
  objectPosition: string;
}
const EMPTY_CARD: LuxuryPromoCard = { eyebrow: "", heading: "", image: "", imageAlt: "", objectPosition: "" };

export default function AdminLuxuryPromoPage() {
  const [left, setLeft] = useState<LuxuryPromoCard>(EMPTY_CARD);
  const [right, setRight] = useState<LuxuryPromoCard>(EMPTY_CARD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/luxury-promo")
      .then((res) => res.json())
      .then((data) => {
        setLeft({ ...EMPTY_CARD, ...data.section?.left });
        setRight({ ...EMPTY_CARD, ...data.section?.right });
      })
      .finally(() => setLoading(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/luxury-promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ left, right }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Luxury Promo Section</h1>
        <p className="text-[12.5px] text-stone mt-1">The homepage's full-height two-card editorial banner. Text and image only — this section has no button.</p>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1].map((i) => <div key={i} className="h-64 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <PromoCardFields title="Left card" card={left} onChange={setLeft} />
            <PromoCardFields title="Right card" card={right} onChange={setRight} />
          </div>

          {error && <Banner tone="error">{error}</Banner>}
          {saved && !error && <Banner>Saved.</Banner>}
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </form>
      )}
    </div>
  );
}

function PromoCardFields({
  title, card, onChange,
}: {
  title: string;
  card: LuxuryPromoCard;
  onChange: (next: LuxuryPromoCard) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function set<K extends keyof LuxuryPromoCard>(key: K, value: LuxuryPromoCard[K]) {
    onChange({ ...card, [key]: value });
  }

  return (
    <Card title={title}>
      <div className="space-y-3">
        <Input label="Eyebrow" placeholder="e.g. Breezy and Relaxed" value={card.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} />
        <Input label="Heading" placeholder="e.g. Effortless Style" value={card.heading} onChange={(e) => set("heading", e.target.value)} />

        <div>
          <span className="block text-[12.5px] font-medium mb-1.5">Image</span>
          <div className="flex items-center gap-2">
            {card.image && (
              <div className="relative w-20 h-14 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.image} alt="" className="w-full h-full object-cover" />
                <button
                  type="button" onClick={() => set("image", "")} aria-label="Remove image"
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white grid place-items-center"
                >
                  <X size={9} />
                </button>
              </div>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
              {card.image ? "Change" : "Choose"}
            </Button>
          </div>
          <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(url) => { set("image", url); setPickerOpen(false); }} />
        </div>

        <Input label="Image alt text" placeholder="Describe the photo for accessibility" value={card.imageAlt} onChange={(e) => set("imageAlt", e.target.value)} />
        <Input
          label="Image focus position (optional)" placeholder='e.g. "center 30%"'
          value={card.objectPosition} onChange={(e) => set("objectPosition", e.target.value)}
        />
      </div>
    </Card>
  );
}
