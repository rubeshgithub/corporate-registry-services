import crypto from "node:crypto";

/**
 * Google Search Console API client — service-account auth, no OAuth flow,
 * no external SDK dependency. Uses Node's built-in crypto to sign the JWT
 * assertion and exchanges it for a short-lived access token.
 *
 * Env:
 *   GSC_SERVICE_ACCOUNT_JSON — base64-encoded service account key JSON
 *     (the file you download from Google Cloud Console → IAM → Service
 *     Accounts → Keys). Base64 encode with:
 *       [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content -Raw sa.json)))
 *     in PowerShell, or `base64 -w 0 sa.json` on Linux.
 *   GSC_SITE_URL — the exact site string from Search Console. For a
 *     domain property it's `sc-domain:corporateregistryservices.ca`;
 *     for a URL-prefix property `https://www.corporateregistryservices.ca/`.
 *
 * Before this works, the service account's email must be added to
 * Search Console → Settings → Users and permissions → Add user →
 * paste the client_email from the JSON → grant Full permission.
 */

const GSC_BASE = "https://searchconsole.googleapis.com/webmasters/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

type ServiceAccount = {
  client_email: string;
  private_key:  string;
};

export type SearchAnalyticsRow = {
  keys?:       string[];        // present when dimensions requested
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
};

function base64url(input: string | object): string {
  const raw = typeof input === "string" ? input : JSON.stringify(input);
  return Buffer.from(raw).toString("base64url");
}

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GSC_SERVICE_ACCOUNT_JSON is not set");
  let json: ServiceAccount;
  try {
    /* Accept both raw JSON (dev convenience) and base64-encoded JSON
       (env-var safe for CI). Base64 doesn't contain `{` so this heuristic
       is fine. */
    const decoded = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
    json = JSON.parse(decoded);
  } catch (e) {
    throw new Error(`GSC_SERVICE_ACCOUNT_JSON is not valid JSON: ${e instanceof Error ? e.message : "unknown"}`);
  }
  if (!json.client_email || !json.private_key) {
    throw new Error("GSC_SERVICE_ACCOUNT_JSON missing client_email or private_key");
  }
  return json;
}

/** Exchange the service-account JWT for a short-lived access token
 *  (valid ~1 hour). */
async function getAccessToken(): Promise<string> {
  const sa = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss:   sa.client_email,
    scope: SCOPE,
    aud:   TOKEN_URL,
    exp:   now + 3600,
    iat:   now,
  };
  const unsigned = `${base64url(header)}.${base64url(payload)}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(sa.private_key).toString("base64url");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GSC token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(`GSC token exchange returned no access_token: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.access_token;
}

type QueryBody = {
  startDate:  string;              // "YYYY-MM-DD"
  endDate:    string;
  dimensions?: Array<"query" | "page" | "country" | "device" | "date">;
  rowLimit?:   number;             // max 25000
  startRow?:   number;             // pagination
  type?:       "web" | "image" | "video" | "news";
};

/** Fires a searchAnalytics.query and returns the raw rows. Paginates
 *  automatically up to `maxRows` (default 25000). */
export async function searchAnalyticsQuery(body: QueryBody, maxRows = 25000): Promise<SearchAnalyticsRow[]> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error("GSC_SITE_URL is not set");

  const token = await getAccessToken();
  const encoded = encodeURIComponent(siteUrl);
  const url = `${GSC_BASE}/sites/${encoded}/searchAnalytics/query`;

  const rows: SearchAnalyticsRow[] = [];
  let startRow = 0;
  const pageSize = Math.min(25000, maxRows);

  while (rows.length < maxRows) {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        ...body,
        rowLimit: pageSize,
        startRow,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GSC query failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const data = await res.json() as { rows?: SearchAnalyticsRow[] };
    const batch = data.rows ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;   // no more results
    startRow += pageSize;
  }

  return rows.slice(0, maxRows);
}

/** Convenience: fetch top pages for a date range. */
export async function fetchTopPages(startDate: string, endDate: string, limit = 500) {
  return searchAnalyticsQuery({
    startDate, endDate,
    dimensions: ["page"],
    type:       "web",
  }, limit);
}

/** Convenience: fetch top queries for a date range. */
export async function fetchTopQueries(startDate: string, endDate: string, limit = 1000) {
  return searchAnalyticsQuery({
    startDate, endDate,
    dimensions: ["query"],
    type:       "web",
  }, limit);
}

/** Convenience: fetch (page, query) pairs — the drill-down that shows
 *  which queries drive impressions to each page. Heavier — capped smaller. */
export async function fetchPageQueryJoin(startDate: string, endDate: string, limit = 5000) {
  return searchAnalyticsQuery({
    startDate, endDate,
    dimensions: ["page", "query"],
    type:       "web",
  }, limit);
}
