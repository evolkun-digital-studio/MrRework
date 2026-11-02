export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap" aria-hidden="true">
      <svg
        viewBox="0 0 36 36"
        className="h-8 w-8 shrink-0"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="1" y="1" width="34" height="34" rx="17" fill="#111111" />
        <path
          d="M9.5 24.5V11.5L14.6 18.2L18 13.8L21.4 18.2L26.5 11.5V24.5"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={`font-display font-bold leading-none tracking-[-0.035em] text-ink ${
          compact ? "text-[18px]" : "text-[20px]"
        }`}
      >
        MrRework
      </span>
    </span>
  );
}
