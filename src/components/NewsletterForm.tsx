"use client";
import { useState } from "react";

export function NewsletterForm({ buttonText = "Subscribe →", variant = "default" }: { buttonText?: string; variant?: "default" | "boxed" }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setState("loading");
    try {
      const res = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setState("done"); setMsg(data.message);
    } catch (err) { setState("error"); setMsg(err instanceof Error ? err.message : "Error"); }
  }
  if (state === "done") return <p className="max-w-[520px] mx-auto mt-9 text-[15px]">{msg}</p>;
  const boxed = variant === "boxed";
  return <form onSubmit={submit} className={boxed ? "max-w-[660px] mx-auto mt-10 flex overflow-hidden rounded-[16px] border-2 border-ink" : "max-w-[520px] mx-auto mt-9 flex border-b border-ink"}>
    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" aria-label="Email" className={`flex-1 min-w-0 bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink py-3.5 px-4 text-[16px] placeholder:text-stone ${boxed ? "md:px-5" : ""}`} />
    <button type="submit" disabled={state === "loading"} className={`text-[12px] font-bold uppercase tracking-wide px-5 py-3.5 disabled:opacity-50 ${boxed ? "bg-ink text-paper md:px-8" : ""}`}>{state === "loading" ? "…" : buttonText}</button>
    {state === "error" && <span className="absolute mt-12 text-[11px] text-stone">{msg}</span>}
  </form>;
}
