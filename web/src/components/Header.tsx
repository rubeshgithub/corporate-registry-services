import { getPrices } from "@/lib/pricing";
import HeaderClient from "./HeaderClient";

/**
 * Server shell for the site header.
 *
 * The header is interactive (dropdowns, burger) so the markup lives in a
 * client component — but the nav hints quote prices, and a client component
 * cannot read the pricing catalogue (it's Mongo-backed). This shell resolves
 * prices on the server and hands them across as plain data.
 *
 * Call sites are unchanged: 38 pages render `<Header />` and none of them
 * need to know about this split. Pages with ISR pick up a price change on
 * their next revalidation; fully static pages pick it up on the next build,
 * which is exactly what happened before, minus the hand-edited literals.
 *
 * getPrices() already falls back to code defaults if Mongo is unreachable,
 * so this cannot take a page down over a pricing lookup.
 */
export default async function Header() {
  const prices = await getPrices();
  return <HeaderClient prices={prices} />;
}
