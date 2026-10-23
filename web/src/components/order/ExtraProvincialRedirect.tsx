"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * /order/service/extra-provincial → the incorporation form (owner, Oct 2026). That form asks for what the
 * Statement of Extra-Provincial Registration needs (head office, directors, home jurisdiction) and offers the
 * home-jurisdiction documents add-on. Done in the browser so the generic service pages stay static.
 *
 * Links come in two shapes:
 *   - from a registry search result: ?q=<corporation>&jurisdiction=<its HOME province>&registryId=… — so the
 *     jurisdiction is the home one, and the province to register in is still to be picked;
 *   - from articles: ?jurisdiction=<the province to register in> (or none).
 */
export default function ExtraProvincialRedirect() {
  const sp = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const out = new URLSearchParams({ type: "extra-provincial" });
    const q = (sp.get("q") ?? "").trim();
    const j = (sp.get("jurisdiction") ?? "").trim();
    if (q || sp.get("registryId")) {
      if (q) out.set("corp", q.slice(0, 200));
      if (j) out.set("home", j.slice(0, 20));
    } else if (j) {
      out.set("jurisdiction", j.slice(0, 20));
    }
    out.set("src", (sp.get("src") ?? "direct").slice(0, 100));
    router.replace(`/order/incorporation?${out.toString()}`);
  }, [sp, router]);
  return <div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>;
}
