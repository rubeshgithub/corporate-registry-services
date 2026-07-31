# PEI Registry integration — context for AI assistants

Keep this file next to `peiRegistry.js`. It records constraints that are not
visible from the source and that are easy to "clean up" into breakage.

## What this is

`peiRegistry.js` queries the Government of PEI corporate registry. No API key,
no login — the two search activities report `"secured": false` from PEI's own
preflight endpoint. There are two registries behind one gateway:

| Registry | Service | Activities | Name matching |
|---|---|---|---|
| Current (fronts OCBR) | `BusinessAPI` | `BusinessSearch`, `BusinessView` | fuzzy, ranked |
| Legacy ("- Original") | `LegacyBusiness` | `LegacyBusinessSearch` | case-insensitive substring |

Everything is `POST https://wdf.princeedwardisland.ca/api/workflow`, with the
service and activity named in the JSON body.

## Rules that will break the integration if changed

1. **Server-side only.** Never import this into the React bundle. The upstream
   does not send CORS headers for our origin. It belongs behind our own
   `/api/pei/*` routes.

2. **Send every form key, `null` for blanks — never omit them.** The real
   browser form always submits all fields. Omitting one makes the API answer
   `"The service is not available at this time."` Do not "tidy" `buildBody` by
   stripping nulls. This is also what makes an any-type search possible:
   `company_type: null` means "any", which the site's own URL format cannot express.

3. **That error string is a catch-all.** It is returned for a malformed request,
   for a record that does not exist, *and* for a real backend fault, with nothing
   to tell them apart. Never surface it to end users as "the registry is down" —
   it usually is not. `assertNotUpstreamError` throws a deliberately hedged message.

4. **Search is a disambiguation step, not a lookup.** Current-registry name
   matching is fuzzy: searching `BABA` returns `BABY WAVES`, `Brackley Babes`,
   and `Bass Pro Shops`. Never auto-select the first result. Render candidates
   and let the user choose.

5. **Two-step retrieval.** Search rows carry only name, business number, company
   type, status, and entity ID. Address, owner, nature of business, and the
   registration/renewal/expiry dates exist *only* on `getEntity(id)`.

6. **Do not add ID enumeration.** Entity IDs are sequential and `BusinessView`
   accepts any of them, but sweeping the range conflicts with the registry's
   terms of use and there is a WAF in front that blocks aggressive clients.
   Per-user interactive lookups are fine; bulk harvesting is not. If we ever
   need a dataset, request a bulk extract from PEI Corporate Registry
   (902-368-4550 / askcorporateregistry@apps.gov.pe.ca).

## Known-unverified: the two parsers

The **request** shape was reconstructed by reading PEI's own Angular bundles
(`js/common.js`, `js/620.js`) and is well grounded. The **response** parsers are
not: `body.data` is a tree of "dynamic element" descriptors, and they were written
from rendered HTML without ever observing the raw JSON.

`parseSearch` and `parseRecord` are provisional. The weakest point is the
`entityId` mapping, which pairs link hrefs to table rows *positionally* — wrong
if the payload orders them differently.

Every call returns `.raw`, so the route can ship before the parsers are correct.

**First task for anyone picking this up:**

```
node peiRegistry.js probe "BABA'S LOUNGE"
node peiRegistry.js probe-view 24436
```

Read the raw payload, then rewrite `parseSearch` / `parseRecord` against the real
structure and drop the defensive `walk()` heuristics for direct field access.

## Reference values

Known-good record for testing — entity ID `24436`:

```
Entity Name         BABA'S LOUNGE
Business Number     832815864-141006
Registration Number 141006
Business Type       Trade Name
Status              Active
Registration Date   December 23, 2009
Renewal Date        October 22, 2024
Expiry Date         December 23, 2027
Address             181 GREAT GEORGE ST CHARLOTTETOWN, PE C1A 4L1
Nature of Business  restaurant and bar
Owner               CEDARS FOODS (2010) LIMITED
```

`company_type`: `incorporated_company`, `limited_partnership`, `partnership`,
`sole_prop`, `trade_name`, `unlimited_liability_corp`, `extra_provincial`,
`cooperative`, `non_profit`, `credit_union`

`status`: `active`, `inactive`, `inactive_non_payment`, `expired`, `reserved`,
`discontinued`, `cancelled`, `dissolved`, `pending_dissolution`, `amalgamated`,
`inactive_connected_company`, `administratively_dissolved`, `transitioning`

Legacy registry uses `business_status` instead: `1` active, `0` inactive, null any.

## Build tasks

- [ ] Run the probe, rewrite both parsers against the real payload
- [ ] Mount `/api/pei/search` and `/api/pei/entity/:id` behind our own origin
- [ ] Cache by query for ~15 min; the data changes on a registration cycle, not per request
- [ ] Rate-limit per user session; debounce any typeahead hard
- [ ] Surface upstream failures as "lookup unavailable, try again", never as a registry outage
