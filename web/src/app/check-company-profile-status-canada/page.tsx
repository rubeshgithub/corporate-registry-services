import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CompanyProfileSearch from "@/components/CompanyProfileSearch";

export const metadata: Metadata = {
  title: "Check Company Profile & Status Canada — Free Lookup Tool — CRS",
  description:
    "Check any company's profile and status across all Canadian registries. Get company information, address, incorporation details, business data, and more instantly. Free company lookup tool.",
  keywords: "company profile, company status, Canada, corporation lookup, business information",
};

/**
 * Check Company Profile & Status Canada
 *
 * Comprehensive company profile lookup tool searching across all Canadian
 * registries with enriched data from D&B and Google Places.
 *
 * URL: /check-company-profile-status-canada
 * Use case: Anyone wanting to research a Canadian company
 * Data sources: Federal + provincial registries, D&B, Google Places
 */
export default function CheckCompanyProfileStatusPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>
        <CompanyProfileSearch />
      </main>
      <Footer />
    </>
  );
}
