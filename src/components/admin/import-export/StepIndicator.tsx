"use client";
import { Check } from "lucide-react";

export const WIZARD_STEPS = [
  { key: "type", label: "Import Type" },
  { key: "upload", label: "Upload" },
  { key: "preview", label: "Preview" },
  { key: "analysis", label: "Analysis" },
  { key: "mapping", label: "Column Mapping" },
  { key: "validation", label: "Validation" },
  { key: "run", label: "Import" },
  { key: "report", label: "Report" },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

export default function StepIndicator({ current }: { current: WizardStepKey }) {
  const currentIndex = WIZARD_STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
      {WIZARD_STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step.key} className="flex items-center shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-brand text-[11.5px] whitespace-nowrap ${
              active ? "bg-ink text-paper dark:bg-[#f3efe8] dark:text-[#15130f]" : done ? "text-ink dark:text-[#f3efe8]" : "text-stone"
            }`}>
              <span className={`w-4 h-4 rounded-full grid place-items-center text-[9.5px] border ${
                active ? "border-paper dark:border-[#15130f]" : done ? "bg-ink text-paper dark:bg-[#f3efe8] dark:text-[#15130f] border-transparent" : "border-line dark:border-[#332e26]"
              }`}>
                {done ? <Check size={10} /> : i + 1}
              </span>
              {step.label}
            </div>
            {i < WIZARD_STEPS.length - 1 && <span className="w-4 h-px bg-line dark:bg-[#332e26] mx-0.5" />}
          </li>
        );
      })}
    </ol>
  );
}
