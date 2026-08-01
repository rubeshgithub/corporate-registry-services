import { redirect } from "next/navigation";

/**
 * /order/status is now repurposed as a "Check Company Status" entry point.
 * Very few visitors need to check CRS order status (they have the email
 * confirmation), so we forward this URL to the Canada Corporations Search
 * page where visitors can look up any company's registry status.
 */
export default function OrderStatusPage() {
  redirect("/canada-corporations-search");
}
