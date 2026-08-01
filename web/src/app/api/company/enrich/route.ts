import { NextResponse } from "next/server";

/**
 * Enrich company data with D&B and Google Places information.
 *
 * Takes company name and details, returns:
 * - D&B data (employees, industry, revenue, year established)
 * - Google Places data (phone, email, website)
 *
 * All API calls are fire-and-forget with timeouts — enrichment failures
 * never block the page load or user experience.
 */

export async function POST(request: Request) {
  try {
    const { name, businessNumber, location } = await request.json();

    if (!name) {
      return NextResponse.json({ success: false, error: "Company name required" }, { status: 400 });
    }

    // Fetch both in parallel with timeouts
    const [dAndBData, googlePlacesData] = await Promise.allSettled([
      fetchDAndBData(name, businessNumber),
      fetchGooglePlacesData(name, location),
    ]);

    return NextResponse.json({
      success: true,
      dAndBData: dAndBData.status === "fulfilled" ? dAndBData.value : null,
      googlePlacesData: googlePlacesData.status === "fulfilled" ? googlePlacesData.value : null,
    });
  } catch (e) {
    console.error("[company/enrich] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

/**
 * Fetch D&B company data via D&B API.
 * Requires DANDB_API_KEY environment variable.
 */
async function fetchDAndBData(name: string, businessNumber?: string) {
  const key = process.env.DANDB_API_KEY?.trim();
  if (!key) return null;

  try {
    // D&B Company Lookup API
    const query = businessNumber ? `duns=${businessNumber}` : `company_name=${encodeURIComponent(name)}`;
    const res = await fetch(`https://api.dnb.com/v0/company?${query}`, {
      headers: {
        "Authorization": `Bearer ${key}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const company = data.results?.[0];
    if (!company) return null;

    return {
      yearEstablished: company.organization?.yearStarted,
      employees: company.organization?.numberOfEmployees,
      industry: company.organization?.industryCodes?.[0]?.industrySector,
      revenue: company.organization?.annualSalesAmount,
    };
  } catch (e) {
    console.error("[D&B fetch] Error:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Fetch Google Places data via Google Places API.
 * Requires GOOGLE_PLACES_API_KEY environment variable.
 */
async function fetchGooglePlacesData(name: string, location?: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) return null;

  try {
    // Text Search to find the business
    const query = location ? `${name} ${location}` : name;
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`,
      {
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const place = data.results?.[0];
    if (!place) return null;

    // Get detailed place info including phone and website
    const detailRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_phone_number,website,email,business_status&key=${key}`,
      {
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!detailRes.ok) return null;

    const detailData = await detailRes.json();
    const detail = detailData.result;

    return {
      phone: detail?.formatted_phone_number,
      website: detail?.website,
      email: detail?.email,
      placeId: place.place_id,
    };
  } catch (e) {
    console.error("[Google Places fetch] Error:", e instanceof Error ? e.message : e);
    return null;
  }
}
