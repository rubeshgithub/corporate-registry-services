import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import OutreachConsole from "./OutreachConsole";

export const metadata = {
  title: "Outreach — CRS Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login?next=/admin/outreach");
  return <OutreachConsole />;
}
