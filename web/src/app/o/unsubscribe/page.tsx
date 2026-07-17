import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { AlertCircle } from "lucide-react";
import { verifyUnsubscribe } from "@/lib/outreach-token";

/**
 * Two-click unsubscribe confirmation page.
 *
 * Email clients + corporate mail scanners (Gmail, Outlook Safe Links,
 * Proofpoint, etc.) aggressively pre-fetch every link in incoming email as
 * a security scan. If the unsubscribe URL is a plain GET → suppression, every
 * recipient silently auto-unsubscribes on delivery — the suppression list
 * grows to include people who never clicked anything.
 *
 * Fix: the link in the outreach email now lands on this page. The page shows
 * a big "Yes, unsubscribe me" form that POSTs to /api/outreach/unsubscribe.
 * Pre-fetchers hit the page but don't submit the form; only a real human
 * click actually triggers the unsubscribe.
 */

export const metadata = {
  title: "Confirm unsubscribe — CRS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic"; // never cache — the sig gates access

export default async function ConfirmUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; s?: string; t?: string }>;
}) {
  const { e, s, t } = await searchParams;
  const email = (e ?? "").trim().toLowerCase();
  const sig   = (s ?? "").trim();
  const token = (t ?? "").trim();

  const valid = !!email && !!sig && verifyUnsubscribe(email, sig);

  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)", padding: "4rem 1.5rem" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          {!valid ? (
            <>
              <AlertCircle size={40} style={{ color: "#B45309", margin: "0 auto 1rem", display: "block" }} />
              <h1 className="card-heading" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                That unsubscribe link is invalid
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.6 }}>
                The link may have been altered or truncated. Reply directly to any email you received from us
                and we&apos;ll remove your address manually.
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.6, marginTop: "1rem" }}>
                Or email{" "}
                <a href="mailto:support@corporateregistryservices.ca" style={{ color: "var(--secondary)" }}>
                  support@corporateregistryservices.ca
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <h1 className="card-heading" style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
                Unsubscribe from CRS outreach?
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
                We&apos;ll remove <strong style={{ color: "var(--text)" }}>{email}</strong> from our outreach list.
                You won&apos;t receive further filing-reminder emails from us.
              </p>

              <form
                action="/api/outreach/unsubscribe"
                method="POST"
                style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "stretch" }}
              >
                <input type="hidden" name="e" value={email} />
                <input type="hidden" name="s" value={sig} />
                <input type="hidden" name="t" value={token} />
                <button
                  type="submit"
                  style={{
                    padding:      "0.9rem 1.2rem",
                    background:   "var(--primary)",
                    color:        "#FFFFFF",
                    fontSize:     "1rem",
                    fontWeight:   700,
                    border:       "none",
                    borderRadius: "0.5rem",
                    cursor:       "pointer",
                  }}
                >
                  Yes, unsubscribe me
                </button>
                <a
                  href="/"
                  style={{
                    padding:      "0.75rem 1.2rem",
                    background:   "transparent",
                    color:        "var(--text-muted)",
                    fontSize:     "0.9rem",
                    fontWeight:   500,
                    textDecoration: "none",
                    borderRadius: "0.5rem",
                    border:       "1px solid var(--border)",
                    textAlign:    "center",
                  }}
                >
                  No, keep me subscribed
                </a>
              </form>

              <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: 1.55, marginTop: "1.5rem" }}>
                We use a confirm-first flow so mail scanners that pre-fetch links can&apos;t accidentally
                unsubscribe you.
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
