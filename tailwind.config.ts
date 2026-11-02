import type { Config } from "tailwindcss";

const config: Config = {
  // Class-based so dark mode can be scoped to just the Admin CMS (a `dark`
  // class on the admin shell wrapper) without affecting the storefront,
  // which never applies this class and doesn't use any `dark:` variants.
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        "paper-2": "#FAFAFA",
        ink: "#111111",
        "ink-2": "#2A2A2A",
        // Neutral gray (was a warm taupe tuned for the old cream --paper).
        // ~5.3:1 against white, keeps text-stone (used ~500 times sitewide
        // for body/caption text, not just large/decorative type) above
        // WCAG AA's 4.5:1 threshold for normal text.
        stone: "#6B6B6B",
        line: "#EAEAEA",
        white2: "#FAFAFA",
        // Sage/mint green sampled from the reference homepage's accent
        // labels + secondary button (a softer, lighter green than the old
        // forest-green #2F6B3F this replaced).
        green: "#6FAF83",
        "green-dark": "#5B9A70",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "system-ui", "sans-serif"],
      },
      borderRadius: { brand: "20px", "brand-lg": "40px" },
      transitionTimingFunction: { brand: "cubic-bezier(.22,1,.36,1)" },
      // moves it by precisely one full copy's width, landing back on an
      // identical-looking frame with no visible seam/reset.
      keyframes: {
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
      },
      animation: {
        marquee: "marquee linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
