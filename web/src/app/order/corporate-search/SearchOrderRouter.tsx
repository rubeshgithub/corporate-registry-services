"use client";

import { useSearchParams } from "next/navigation";
import NameSearchOrderFlow from "@/components/order/NameSearchOrderFlow";
import CorporationServiceOrderFlow from "@/components/order/CorporationServiceOrderFlow";
import { NAME_SEARCH_CONFIGS } from "@/lib/name-search-config";

/**
 * Route between two flows based on URL params:
 * - If src=article-status-search-*: Show corporation service order (visitor found a corp on article)
 * - Otherwise: Show name search form (visitor wants to search for a name)
 */
export default function SearchOrderRouter() {
  const params = useSearchParams();
  const src = params.get("src") ?? "";
  const isFromArticleSearch = src.startsWith("article-status-search-");

  if (isFromArticleSearch) {
    // Visitor searched on article, found a corporation, now ordering a service
    return <CorporationServiceOrderFlow />;
  }

  // Standard flow: propose a name to search
  return <NameSearchOrderFlow config={NAME_SEARCH_CONFIGS["corporate-search"]} />;
}
