import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import NonprofitsConsole from "./NonprofitsConsole";

export const metadata = {
  title: "Alberta Non-Profits — CRS Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NonprofitsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login?next=/admin/nonprofits");
  return <NonprofitsConsole />;
}
