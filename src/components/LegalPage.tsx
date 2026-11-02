import Link from "next/link";

export type LegalSection = { title: string; paragraphs?: string[]; bullets?: string[] };

export default function LegalPage({ title, updated, sections }: { title: string; updated?: string; sections: LegalSection[] }) {
  return (
    <main className="px-5 md:px-12 py-16 md:py-24">
      <article className="mx-auto max-w-[900px]">
        <Link href="/" className="font-mono text-[11px] tracking-[0.12em] uppercase text-stone hover:text-ink transition">← Back to home</Link>
        <h1 className="font-display text-5xl md:text-7xl uppercase tracking-tight mt-10">{title}</h1>
        {updated && <p className="font-mono text-[11px] tracking-wide text-stone mt-4">{updated}</p>}
        <div className="mt-14 space-y-10 text-[15px] leading-7 text-ink-2">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-mono text-lg font-bold tracking-[0.12em] uppercase text-ink mb-3">{section.title}</h2>
              {section.paragraphs?.map((p) => <p key={p} className="mb-3">{p}</p>)}
              {section.bullets && <ul className="list-disc pl-6 space-y-1">{section.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
