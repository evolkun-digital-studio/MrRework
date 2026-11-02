"use client";

// Shared primitives for the Admin CMS. Deliberately a tighter, denser
// visual language than the storefront's spacious editorial style — this is
// a working tool, not a shopping experience — but built from the exact same
// design tokens (--paper/--ink/--stone/--line, rounded-brand, font-mono for
// numbers/codes) so it still reads as the same product family.
//
// `dark:` variants throughout give the Settings > theme toggle broad,
// genuine coverage across every admin page for free, since pages are all
// composed from these primitives — see tailwind.config.ts (darkMode:
// "class") and AdminShell, which is the only place the `dark` class is
// ever applied, scoping this entirely to /admin.

export function Card({ title, description, action, children, className = "" }: {
  title?: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line dark:border-[#332e26]">
          <div>
            {title && <h2 className="text-[14px] font-semibold">{title}</h2>}
            {description && <p className="text-[12px] text-stone mt-0.5">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide text-stone">{label}</span>
        {icon && <span className="text-stone">{icon}</span>}
      </div>
      <div className="font-mono text-[22px] leading-none">{value}</div>
      {sub && <div className="text-[11px] text-stone mt-1.5">{sub}</div>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  neutral: "bg-paper-2 dark:bg-[#26221b] text-ink dark:text-[#f3efe8] border-line dark:border-[#332e26]",
  success: "bg-[#1f3d2b] text-white border-[#1f3d2b]",
  warning: "bg-[#4a3a10] text-white border-[#4a3a10]",
  danger: "bg-[#4a1414] text-white border-[#4a1414]",
  info: "bg-ink text-paper border-ink",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center text-[10px] uppercase tracking-wide px-2 py-1 rounded-brand border ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  variant = "primary", size = "md", className = "", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-brand transition disabled:opacity-40 disabled:pointer-events-none font-medium";
  const sizes = size === "sm" ? "text-[12px] px-3 py-1.5" : "text-[13px] px-4 py-2.5";
  const variants = {
    primary: "bg-ink text-paper dark:bg-[#f3efe8] dark:text-[#15130f] hover:opacity-85",
    ghost: "border border-line dark:border-[#332e26] hover:border-ink dark:hover:border-[#f3efe8]",
    danger: "border border-[#4a1414] text-[#4a1414] dark:text-[#e08585] hover:bg-[#4a1414] hover:text-white",
  };
  // Defaults to "button", not the HTML-implicit "submit" — this component
  // is used both inside and outside <form>s across the admin, and most
  // call sites (dialog actions, filters, pagination) never intend to
  // submit anything. `type` in props still wins where a real submit
  // button explicitly passes `type="submit"`.
  return <button type="button" className={`${base} ${sizes} ${variants[variant]} ${className}`} {...props} />;
}

export function Input({ label, error, className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: boolean }) {
  const id = props.id ?? (label ? `admin-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  return (
    <label className="block" htmlFor={id}>
      {label && <span className="text-[11px] uppercase tracking-wide text-stone">{label}</span>}
      <input
        id={id} aria-invalid={error}
        className={`w-full ${label ? "mt-1.5" : ""} bg-transparent border rounded-brand px-3 py-2 text-[13px] outline-none transition placeholder:text-stone ${error ? "border-[#4a1414]" : "border-line dark:border-[#332e26] focus:border-ink dark:focus:border-[#f3efe8]"} ${className}`}
        {...props}
      />
    </label>
  );
}

export function Textarea({ label, className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const id = props.id ?? (label ? `admin-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  return (
    <label className="block" htmlFor={id}>
      {label && <span className="text-[11px] uppercase tracking-wide text-stone">{label}</span>}
      <textarea
        id={id}
        className={`w-full ${label ? "mt-1.5" : ""} bg-transparent border border-line dark:border-[#332e26] rounded-brand px-3 py-2 text-[13px] outline-none transition focus:border-ink dark:focus:border-[#f3efe8] placeholder:text-stone ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({ label, options, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string; label: string }[] }) {
  const id = props.id ?? (label ? `admin-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  return (
    <label className="block" htmlFor={id}>
      {label && <span className="text-[11px] uppercase tracking-wide text-stone">{label}</span>}
      <select id={id} className={`w-full ${label ? "mt-1.5" : ""} bg-transparent border border-line dark:border-[#332e26] rounded-brand px-3 py-2 text-[13px] outline-none transition focus:border-ink dark:focus:border-[#f3efe8] ${className}`} {...props}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto -mx-5 px-5 ${className}`}>
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  );
}
export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left text-[10.5px] uppercase tracking-wide text-stone font-medium px-3 py-2.5 border-b border-line dark:border-[#332e26] whitespace-nowrap ${className}`}>{children}</th>;
}
export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 border-b border-line dark:border-[#332e26] align-middle ${className}`}>{children}</td>;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-14">
      {icon && <div className="mx-auto mb-4 text-stone">{icon}</div>}
      <p className="text-[14px] font-medium">{title}</p>
      {description && <p className="text-[12.5px] text-stone mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Banner({ tone = "neutral", children }: { tone?: "neutral" | "error"; children: React.ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : undefined} className={`text-[13px] rounded-brand px-4 py-3 border ${tone === "error" ? "border-[#4a1414] text-[#4a1414] dark:text-[#e08585] bg-[#4a1414]/5" : "border-line dark:border-[#332e26] bg-paper-2 dark:bg-[#26221b]"}`}>
      {children}
    </p>
  );
}
