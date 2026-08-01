import { redirect } from "next/navigation";

/**
 * /order/company-status-check-canada — "Check Company Status" entry point.
 * Forwards to the Canada Corporations Search page where visitors can look
 * up any company's registry status across all Canadian jurisdictions.
 */
export default function CompanyStatusCheckPage() {
  redirect("/canada-corporations-search");
}
