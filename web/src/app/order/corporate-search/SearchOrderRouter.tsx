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
  const src = params.get("src") ?? "";
  /* Which flow to show. `flow=services` is the explicit signal; the
     `article-status-search-` prefix is the older implicit one, kept so
     existing links keep working. src is NOT used to choose the flow beyond
     that legacy prefix — it carries article attribution, and rewriting it to
     steer routing would misattribute the revenue (analytics strips the
     "article-" prefix to recover the slug). */
  const isFromArticleSearch =
    params.get("flow") === "services" || src.startsWith("article-status-search-");

  if (isFromArticleSearch) {
    // Visitor searched on article, found a corporation, now ordering a service
    return <CorporationServiceOrderFlow prices={prices} />;
  }

  // Standard flow: propose a name to search
  return <NameSearchOrderFlow config={nameSearchConfig ?? NAME_SEARCH_CONFIGS["corporate-search"]} />;
}
