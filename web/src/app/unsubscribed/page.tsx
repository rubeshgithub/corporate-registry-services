import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CheckCircle2, AlertCircle } from "lucide-react";

export const metadata = {
  title: "Unsubscribed — CRS",
  robots: { index: false, follow: false },
};

export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; err?: string }>;
}) {
  const { e, err } = await searchParams;
  const email = e?.trim() ?? "";

  const invalid = err === "invalid";
  const serverErr = err === "server";

  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)", padding: "4rem 1.5rem" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          {invalid ? (
            <>
              <AlertCircle size={40} style={{ color: "#B45309", margin: "0 auto 1rem", display: "block" }} />
              <h1 className="card-heading" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                That unsubscribe link is invalid
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.6 }}>
                The link may have been altered or truncated. Reply directly to any email you received from us
                and we&apos;ll remove your address manually.
              </p>
            </>
          ) : serverErr ? (
            <>
              <AlertCircle size={40} style={{ color: "#B45309", margin: "0 auto 1rem", display: "block" }} />
              <h1 className="card-heading" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                Something went wrong
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.6 }}>
                We couldn&apos;t record your unsubscribe. Please email{" "}
                <a href="mailto:support@corporateregistryservices.ca" style={{ color: "var(--secondary)" }}>
                  support@corporateregistryservices.ca
                </a>{" "}
                and we&apos;ll remove you immediately.
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 size={40} style={{ color: "var(--secondary)", margin: "0 auto 1rem", display: "block" }} />
              <h1 className="card-heading" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                You&apos;ve been unsubscribed
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                {email
                  ? <>We&apos;ve removed <strong>{email}</strong> from our outreach list. You won&apos;t receive further filing-reminder emails from us.</>
                  : <>Your address has been removed from our outreach list.</>}
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.6 }}>
                If you unsubscribed by mistake, or need to reach us about an existing order,
                email <a href="mailto:support@corporateregistryservices.ca" style={{ color: "var(--secondary)" }}>
                  support@corporateregistryservices.ca
                </a>.
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
