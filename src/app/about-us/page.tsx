import Link from "next/link";
import { Clock3, Mail, Phone } from "lucide-react";

const WHY_CHOOSE = [
  ["Unique Pieces", "No two pieces are exactly alike. Our collections are designed for individuals who want clothing that reflects their personality rather than trends."],
  ["Sustainability First", "Through reworking and upcycling, we reduce textile waste and extend the lifecycle of garments."],
  ["Curated Vintage & Y2K", "We source authentic vintage and Y2K pieces that capture the spirit of different eras while remaining relevant today."],
  ["Handcrafted Creativity", "Our reconstructed garments combine vintage elements with modern silhouettes, creating entirely new pieces from existing materials."],
  ["Quality & Attention To Detail", "Every item undergoes careful inspection and quality checks before reaching our customers."],
  ["Community Driven", "MrRework is more than a clothing brand—it's a community of individuals who appreciate creativity, self-expression, and conscious fashion."],
];

const WHAT_WE_DO = [
  "Reworked & reconstructed garments",
  "Upcycled fashion pieces",
  "Vintage & pre-owned apparel",
  "Y2K fashion collections",
  "One-of-a-kind handmade designs",
  "Limited-edition drops",
  "Wholesale vintage and reworked clothing",
];

export default function AboutUsPage() {
  return (
    <main className="bg-white pt-[78px] text-ink md:pt-[88px]">
      <div className="px-5 pt-5 md:px-12">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.12em] text-stone hover:text-ink transition">← Back to home</Link>
      </div>
      <header className="bg-[#f3f5f6] px-5 py-5 text-center md:py-4">
        <h1 className="font-sans text-[24px] font-normal leading-tight md:text-[27px]">About MrRework – Reworked, Upcycled, Vintage &amp; Y2K Fashion</h1>
      </header>
      <section className="mx-auto grid max-w-[1288px] gap-10 px-5 pb-16 pt-10 md:grid-cols-[2fr_1fr] md:gap-7 md:px-0 md:pb-24 md:pt-10">
        <div className="mt-20 flex items-center bg-black px-10 py-12 text-white md:px-14">
          <div>
            <h2 className="text-[24px] font-bold leading-[1.25]">Redefining Fashion Through Creativity &amp; Sustainability</h2>
            <p className="mt-2 text-[17px] leading-[1.75]">Welcome to MrRework, where vintage heritage meets modern creativity.</p>
            <p className="mt-4 text-[17px] leading-[1.75]">At MrRework, we believe clothing should tell a story. Our mission is to breathe new life into existing garments through reworking, upcycling, reconstruction, and thoughtful curation, creating pieces that are unique, expressive, and built to stand apart from fast fashion.</p>
            <p className="mt-4 text-[17px] leading-[1.75]">From authentic vintage treasures and iconic Y2K styles to one-of-a-kind reconstructed garments, every piece we create or source represents individuality, craftsmanship, and sustainability.</p>
          </div>
        </div>
        <div className="mt-20 px-8 md:px-0">
          <h2 className="text-[24px] font-normal leading-[1.02]">Our Journey</h2>
          <p className="mt-2 text-[16px] leading-[1.65] text-stone">MrRework was founded with a simple vision: <strong className="font-bold text-ink-2">to transform fashion waste into wearable art while preserving the timeless appeal of vintage clothing.</strong></p>
          <p className="mt-3 text-[16px] leading-[1.65] text-stone">What began as a passion for vintage culture and heritage garments has evolved into a brand that celebrates self-expression through carefully curated and creatively reimagined clothing.</p>
          <p className="mt-3 text-[16px] leading-[1.65] text-stone">Inspired by streetwear, vintage fashion, and the Y2K era, MrRework exists for those who want clothing that feels personal, distinctive, and impossible to replicate.</p>
        </div>
      </section>
      <section className="bg-[#633718] px-5 pb-12 pt-8 text-white md:px-16 md:pb-16">
        <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-8 text-center md:grid-cols-3 md:gap-12">
          <div><Mail className="mx-auto text-[#c47a28]" size={30} /><h2 className="mt-3 text-[15px] font-bold uppercase tracking-wide">Mail Us</h2><p className="mt-3 text-[9px]">no-reply@mrrework.com</p></div>
          <div><Phone className="mx-auto text-[#c47a28]" size={30} /><h2 className="mt-3 text-[15px] font-bold uppercase tracking-wide">Call</h2><p className="mt-3 text-[9px]">+91-8526100000 or +91-8439693223</p></div>
          <div><Clock3 className="mx-auto text-[#c47a28]" size={30} /><h2 className="mt-3 text-[15px] font-bold uppercase tracking-wide">Operational Hours</h2><p className="mt-3 text-[9px]">Mon-Sat (10:00AM-7:00PM)</p></div>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1160px] gap-10 px-5 py-16 md:grid-cols-[1fr_1.1fr] md:gap-12 md:px-0">
        <div className="self-start rounded-md bg-paper-2 p-6 text-[12px] leading-[1.65] text-ink-2 shadow-lg">
          <p>Fashion should not be disposable. By giving existing garments a second life, we actively contribute towards a more sustainable future while creating pieces that stand apart from mass-produced clothing.</p>
          <ul className="mt-3 list-disc space-y-1 pl-4">
            <li>Individuality is timeless.</li>
            <li>Sustainability is the future of fashion.</li>
            <li>Imperfections make garments unique.</li>
            <li>Clothing should have meaning and character.</li>
          </ul>
        </div>
        <div className="text-[12px] leading-[1.65] text-ink-2">
          <h2 className="mb-5 text-[16px] font-normal text-ink">Why Choose MrRework?</h2>
          <ol className="list-decimal space-y-4 pl-5">
            {WHY_CHOOSE.map(([title, text]) => (
              <li key={title}><strong>{title}:</strong> {text}</li>
            ))}
          </ol>
        </div>
      </section>
      <section className="border-t border-line px-5 py-16 md:px-12">
        <div className="mx-auto max-w-[700px] text-center">
          <h2 className="text-[16px] font-normal text-ink">What We Do</h2>
          <p className="mt-3 text-[12px] leading-[1.65] text-ink-2">At MrRework, we specialize in:</p>
          <ul className="mx-auto mt-6 grid max-w-[560px] grid-cols-1 gap-x-8 gap-y-2.5 text-left sm:grid-cols-2">
            {WHAT_WE_DO.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12px] leading-[1.65] text-ink-2">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-2" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[12px] leading-[1.65] text-ink-2">Every product is selected or created with attention to detail, ensuring that each piece carries its own identity and story.</p>
        </div>
      </section>
      <section className="border-t border-line px-5 pb-12 pt-8 md:px-12 md:pb-16 md:pt-10">
        <div className="mx-auto grid max-w-[1160px] grid-cols-2 gap-6 text-center md:grid-cols-4 md:gap-8">
          {[
            ["Worldwide Shipping", "Fast and secure delivery across India, the UK, Europe, the USA, and worldwide."],
            ["Premium Vintage & Y2K", "Curated collections featuring iconic styles and timeless pieces."],
            ["Reworked & Upcycled", "One-of-a-kind garments created by transforming existing materials into something entirely new."],
            ["Trusted Wholesale Partner", "Supplying premium vintage and reworked clothing to resellers, boutiques, and fashion businesses globally."],
          ].map(([title, text]) => (
            <div key={title}>
              <h2 className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-stone">{title}</h2>
              <p className="mx-auto mt-1 max-w-[190px] text-[8px] leading-tight text-stone">{text}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-[1160px] border-t border-line pt-10 text-center">
          <h2 className="text-[16px] font-normal text-ink">Our Vision</h2>
          <p className="mx-auto mt-3 max-w-[620px] text-[12px] leading-[1.65] text-ink-2">To build a future where fashion is more sustainable, more creative, and more personal.</p>
          <p className="mx-auto mt-2 max-w-[620px] text-[12px] leading-[1.65] text-ink-2">We aim to inspire people to move away from disposable fashion and embrace clothing that carries history, craftsmanship, and individuality.</p>
          <p className="mx-auto mt-2 max-w-[620px] text-[12px] leading-[1.65] text-ink-2">At MrRework, every piece has a past—and every piece is given a new future.</p>

          <h2 className="mt-10 text-[16px] font-normal text-ink">Join The Movement</h2>
          <p className="mx-auto mt-3 max-w-[620px] text-[12px] leading-[1.65] text-ink-2">Whether you&apos;re discovering vintage fashion for the first time, searching for rare Y2K pieces, or looking for unique reworked garments, MrRework welcomes you.</p>
          <p className="mx-auto mt-2 max-w-[620px] text-[12px] leading-[1.65] text-ink-2">Thank you for being part of our journey.</p>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-stone">Reworked. Reimagined. Relived.</p>
        </div>

        <div className="mx-auto mt-10 max-w-[1160px] border-t border-line pt-7 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone">Where Vintage Meets The Future</p>
          <div className="mt-2 font-display text-[62px] leading-[0.8] tracking-[-0.04em] md:text-[92px]">MRREWORK</div>
        </div>
      </section>
    </main>
  );
}
