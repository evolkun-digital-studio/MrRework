import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[80dvh] grid place-items-center px-5 text-center">
      <div>
        <div className="font-display leading-none" style={{ fontWeight: 800, fontSize: "clamp(80px,18vw,220px)" }}>404</div>
        <p className="eyebrow mb-6">This page has sold out</p>
        <Link href="/" className="btn"><span>Back to home</span></Link>
      </div>
    </div>
  );
}
