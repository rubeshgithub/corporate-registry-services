import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CompanyProfileSearch from "@/components/CompanyProfileSearch";

export const metadata: Metadata = {
  title: "Company Profile & Status Lookup — CRS",
  description:
    "Search company information across all Canadian registries. View company status, address, incorporation date, business details, and more. Free lookup tool.",
  robots: { index: true, follow: true },
};

export default function CompanyProfilePage() {
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
