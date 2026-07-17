import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import CompaniesConsole from "./CompaniesConsole";

export const metadata = {
  title: "Corporations — CRS Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login?next=/admin/companies");
  return <CompaniesConsole />;
}
