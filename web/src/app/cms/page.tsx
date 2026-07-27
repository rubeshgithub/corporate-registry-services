import { redirect } from "next/navigation";
import { isCmsAuthenticated } from "@/lib/cms-auth";
import CmsDashboard from "./CmsDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CmsDashboardPage() {
  if (!(await isCmsAuthenticated())) redirect("/cms/login");
  return <CmsDashboard />;
}
