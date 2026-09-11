"use client";

import { useSearchParams } from "next/navigation";
import NameSearchOrderFlow from "@/components/order/NameSearchOrderFlow";
import CorporationServiceOrderFlow from "@/components/order/CorporationServiceOrderFlow";
import { NAME_SEARCH_CONFIGS, type NameSearchServiceConfig } from "@/lib/name-search-config";

/**
 * Route between two flows based on URL params:
 * - If src=article-status-search-*: Show corporation service order (visitor found a corp on article)
 * - Otherwise: Show name search form (visitor wants to search for a name)
 */
export default function SearchOrderRouter({ nameSearchConfig, prices }: { nameSearchConfig?: NameSearchServiceConfig; prices?: Record<string, number> }) {
  const params = useSearchParams();
  /* Which of the two flows to render.
   *
   * `flow` is the only thing that decides this. It used to be inferred from
   * `src` starting with "article-status-search-", which was wrong twice over:
   * a caller had to know an undocumented prefix to get the right screen (the
   * CORES widget didn't, and sent visitors to a name-search form for a company
   * they already owned), and `src` is an attribution field — analytics.ts
   * strips its "article-" prefix to credit revenue to an article, so bending
   * src to steer routing would have misattributed the revenue.
   *
   * The old prefix is still honoured so any link already in the wild keeps
   * working, but nothing new should rely on it. */
  const flow = params.get("flow");
  const legacyServicesPrefix = (params.get("src") ?? "").startsWith("article-status-search-");
  const showServiceMenu = flow === "services" || legacyServicesPrefix;

  if (showServiceMenu) {
    // The visitor already picked an existing corporation — offer services on it.
    return <CorporationServiceOrderFlow prices={prices} />;
  }

  // Standard flow: propose a name to search
  return <NameSearchOrderFlow config={nameSearchConfig ?? NAME_SEARCH_CONFIGS["corporate-search"]} />;
}
