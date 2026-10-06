import crypto from "node:crypto";
import { summarizeRegistryAccess, type RegistryAccess, type RegistryAccessState } from "@/lib/registry-access";

/**
 * Registry codes are encrypted before they leave this server (owner, Oct 2026).
 *
 * A code typed at checkout (BC company password, Ontario Company Key…) used to
 * go into Stripe's metadata and the order email in plain text. Now it is
 * encrypted with docu10's PUBLIC key (RSA-OAEP, SHA-256) and travels as
 * "enc:v1:<base64>". Only docu10 holds the private key, so Stripe, this
 * site's logs and the owner's mailbox never see the code.
 *
 * The public key comes from CHECKOUT_CODE_PUBLIC_KEY (PEM, optional) or from
 * docu10's /api/checkout-key, cached for six hours. If neither is reachable,
 * the code is NOT sent at all — the order says it was entered and must be
 * asked for — rather than falling back to plain text.
 */

const DOCU10 = (process.env.DOCU10_URL ?? "https://docu10.ca").replace(/\/+$/, "");
let cached: { pem: string; at: number } | null = null;

async function publicKey(): Promise<string | null> {
  const fromEnv = process.env.CHECKOUT_CODE_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (fromEnv) return fromEnv;
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.pem;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(`${DOCU10}/api/checkout-key`, { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json() as { publicKey?: string };
    if (!j.publicKey?.includes("BEGIN PUBLIC KEY")) throw new Error("no key in response");
    cached = { pem: j.publicKey, at: Date.now() };
    return cached.pem;
  } catch (e) {
    console.error("[CRS] could not fetch docu10's checkout key:", e instanceof Error ? e.message : e);
    return cached?.pem ?? null;
  }
}

export function sealWith(pem: string, code: string): string {
  const ct = crypto.publicEncrypt({ key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(code, "utf8"));
  return `enc:v1:${ct.toString("base64")}`;
}

/** summarizeRegistryAccess, with any code encrypted to docu10. Server only. */
export async function summarizeRegistryAccessSealed(state: RegistryAccessState | undefined, access: RegistryAccess | null): Promise<string> {
  const code = state?.status === "have" ? state.code.trim().slice(0, 120) : "";
  if (!access || !code) return summarizeRegistryAccess(state, access);
  const pem = await publicKey();
  if (!pem) {
    return `Customer entered the ${access.term} at checkout, but it could not be sent securely — ask them for it before filing.`;
  }
  return `PROVIDED — ${access.term}: ${sealWith(pem, code)}`;
}
