"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Shared collapsible section — extracted from ProductDetail.tsx so Blog/
// Pages/FAQ can reuse the exact same accessible pattern instead of each
// re-implementing its own accordion. `children` (not a plain string) so a
// panel can host either plain text or a <RichContent> block.
export default function Accordion({
  title, children, defaultOpen = false,
}: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="border-b border-line">
      <button type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex justify-between items-center w-full py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
      >
        <span className="text-[14px] font-medium">{title}</span>
        <ChevronDown size={17} className={`transition-transform shrink-0 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }} className="overflow-hidden"
          >
            <div className="pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
