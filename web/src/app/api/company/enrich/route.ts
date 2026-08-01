import { NextResponse } from "next/server";
import { fetchOtherData } from "@/lib/dnb-live";

/**
 * Enrich company data with D&B information via the existing dnb-live integration.
 *
 * Uses the same public D&B endpoint (/dnb.com/business-directory/api/companysearch)
 * that powers the admin company picker — no API keys required, graceful degradation.
 *
 * Returns D&B data: address, city, region, postal code, industry, location type.
 *
 * Fire-and-forget: failures never block the page load.
 */

export async function POST(request: Request) {
  try {
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ success: false, error: "Company name required" }, { status: 400 });
    }

    // Fetch D&B data using existing dnb-live integration
    const dAndBResult = await fetchOtherData(name);

    let dAndBData = null;
    if (dAndBResult.status === "candidates" && dAndBResult.candidates.length > 0) {
      // Return the best match (already ranked by dnb-live)
      const candidate = dAndBResult.candidates[0];
      dAndBData = {
        address: candidate.address,
        city: candidate.city,
        region: candidate.region,
        postalCode: candidate.postalCode,
        industry: candidate.industry,
        locationType: candidate.locationType,
        matchStrength: candidate.matchStrength,
      };
    }

    return NextResponse.json({
      success: true,
      dAndBData,
    });
  } catch (e) {
    console.error("[company/enrich] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ success: true, dAndBData: null }); // Fail gracefully
  }
}
