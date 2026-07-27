# CMS API brief — for external content automation

This is the authenticated JSON API behind the CRS CMS at
`https://www.corporateregistryservices.ca/cms`. It's the same set of
endpoints the CMS UI uses; a scheduled automation (Claude cowork) can
POST directly to create drafts that appear in the human review UI.

**Preferred over the standalone `/api/publish-article` endpoint** —
that one opens PRs; this one drops drafts straight into the CMS's own
review queue where a human clicks "Publish" in the UI.

## Auth

Two paths — pick one:

- **Bearer token** (for automation): `Authorization: Bearer <CMS_API_TOKEN>`
  - Value stored in the site's `CMS_API_TOKEN` env var
  - Fail closed: if that env var isn't set on the server, bearer auth is
    disabled entirely (cookie still works)
  - Ask the site operator for the token; do not paste it into chat
    transcripts
- **Session cookie** (for the CMS UI): `crs_cms_session` — set by
  `POST /api/cms/login` and included automatically by browsers

Bearer works on:

| Endpoint | Bearer allowed? | Reason |
|---|---|---|
| `POST   /api/cms/articles`              | ✅ | Primary automation entry — create draft |
| `GET    /api/cms/articles`              | ✅ | Query "does this slug already exist?" before deciding create vs update |
| `GET    /api/cms/articles/{id}`         | ✅ | Read your own drafts |
| `PUT    /api/cms/articles/{id}`         | ✅ | Update your own drafts (idempotency for weekly runs) |
| `DELETE /api/cms/articles/{id}`         | ❌ | Cookie only — humans only can delete |
| `POST   /api/cms/articles/{id}/publish` | ❌ | Cookie only — humans only can publish |

## Base URL

Production: `https://www.corporateregistryservices.ca`

## Endpoints

### `POST /api/cms/articles` — create a draft

```
POST /api/cms/articles HTTP/1.1
Authorization: Bearer <CMS_API_TOKEN>
Content-Type: application/json

{
  "section":     "articles",
  "slug":        "what-is-a-corporate-minute-book-canada",
  "title":       "What is a Corporate Minute Book in Canada?",
  "h1":          "What is a Corporate Minute Book? (Canada)",
  "description": "A minute book is the central legal record of a Canadian corporation. Every incorporation has one. This guide explains what goes in it, who keeps it, and why banks and lawyers ask for it.",
  "body":        "## Introduction\n\nA corporate minute book is...\n\n(GitHub-flavoured markdown, at least 300 chars for publish)",
  "faq": [
    { "q": "Is a minute book legally required?", "a": "Yes — under the CBCA and every provincial equivalent, every corporation must maintain corporate records at a records office. The minute book is the practical embodiment of that requirement." },
    { "q": "Where should the minute book be kept?", "a": "At the corporation's registered records office in the province of incorporation..." }
  ]
}
```

Response `201 Created`:
```json
{ "ok": true, "id": "<mongo-object-id-24-hex-chars>" }
```

Response `409 Conflict` — an article with that `(section, slug)` already
exists (see `GET /api/cms/articles?slug=X&section=Y` to check first, or
use `PUT /api/cms/articles/{id}` to update the existing draft).

Response `422` — validation problem on `slug` (must be kebab-case) or
`section` (must be one of the known sections).

**Sections accepted:** `articles`, `guides`, `annual-return`,
`incorporation`, `minute-books`, `good-standing`, `profile-reports`,
`not-for-profit`, `nfp-grants`.

**All fields optional on create** — you can POST `{ "section": "articles" }`
to get an empty draft, then PUT fields in. But most automation will send
the full article in one POST.

### `GET /api/cms/articles?slug=X&section=Y` — idempotency check

```
GET /api/cms/articles?slug=what-is-cores-alberta&section=articles HTTP/1.1
Authorization: Bearer <CMS_API_TOKEN>
```

Response:
```json
{
  "ok": true,
  "articles": [
    {
      "id":              "<mongo-id>",
      "slug":            "what-is-cores-alberta",
      "section":         "articles",
      "title":           "...",
      "description":     "...",
      "status":          "draft",
      "createdAt":       "2026-07-27T...",
      "updatedAt":       "2026-07-27T...",
      "publishedAt":     null,
      "publishedUrl":    null,
      "publishedCommit": null
    }
  ]
}
```

Empty `articles: []` means no existing draft/published at that slug — safe
to POST. If a draft exists (`status: "draft"`), you can PUT to update it.
If a published one exists (`status: "published"`), **do not overwrite it
via PUT** — that skips the review workflow. Skip and log a warning
instead.

Other filters: `?status=draft`, `?status=published`, `?q=<substring>` (regex).

### `PUT /api/cms/articles/{id}` — update a draft

```
PUT /api/cms/articles/<mongo-id> HTTP/1.1
Authorization: Bearer <CMS_API_TOKEN>
Content-Type: application/json

{
  "title":       "Updated title",
  "description": "Updated meta description",
  "body":        "Updated markdown body...",
  "faq":         [ { "q": "...", "a": "..." } ]
}
```

Only the fields you send are updated. Status stays `"draft"` — the API
never publishes automatically.

Response `200 OK`:
```json
{ "ok": true, "article": { ...full serialized doc... } }
```

Response `422` — invalid slug or section.

### Fields the CMS renderer expects

These match the frontmatter shape the live `/{section}/{slug}` article
route reads. If any is missing at publish time, validation fails.

| Field | Type | Max | Notes |
|---|---|---|---|
| `slug` | string, kebab-case | 200 | Unique within `section`. Becomes URL: `/{section}/{slug}` |
| `section` | enum (see list above) | — | Fixed set |
| `title` | string | 70 chars | `<title>` in the browser tab + SERP link |
| `h1` | string \| null | — | Overrides visible page title; if null, `title` is used |
| `description` | string | 165 chars | `<meta description>`; shows in Google SERP snippet |
| `body` | markdown | — | GitHub-flavoured markdown; ≥ 300 chars to publish |
| `faq` | `[{ q, a }]` \| null | — | Optional; if present, gets FAQ JSON-LD for rich results |

`body` must not contain `<script>` tags — publish validation rejects them.

## Recommended automation flow

```
for each proposed article:
  1. GET /api/cms/articles?slug=<proposed-slug>&section=<section>
  2. if a match with status="published" exists:
       log "already published — skipping"
       continue
  3. if a match with status="draft" exists:
       PUT /api/cms/articles/<match.id> with the new content
       log "updated existing draft"
       continue
  4. otherwise:
       POST /api/cms/articles with the full content
       on 201:  log "created new draft"
       on 409:  race condition (another process created it) — GET
                by slug and PUT
       on 422:  log validation problems, do not retry
```

Idempotent. Safe to run on a schedule.

## What happens after your automation POSTs a draft

1. The draft appears in the CMS list at `/cms` under Status = Draft
2. A human reviewer opens it in `/cms/edit/<id>`
3. They can preview it at `/cms/preview/<id>`
4. When ready, they click **Publish** in the CMS UI
5. The publish button commits `content/{section}/{slug}.md` to `main`
   via GitHub API → Render auto-deploys → article live at
   `/{section}/{slug}` within ~2 minutes
6. The Mongo record's status flips to `"published"` with the commit SHA

You never see step 5 or 6 as an automation — that's the humans' job.

## Errors your automation should handle

| Status | Meaning | Action |
|---|---|---|
| `401` | Missing/wrong bearer token | Check `CMS_API_TOKEN`; do not retry indefinitely |
| `409` | Duplicate `(section, slug)` on POST | GET by slug, PUT if it's a draft, skip if published |
| `422` | Validation problem (slug format, section) | Log problems; do not retry with same body |
| `500` | Server misconfiguration (env var missing) | Alert operator; retry after backoff |
| `502` | Upstream failure (GitHub, Mongo) | Retry with exponential backoff |

## Health

There is no dedicated `/health` for the CMS. Use
`GET /api/cms/articles?status=draft&section=articles` — a 200 with an
`articles` array (possibly empty) means the API + auth + Mongo are all
healthy.

## Key rotation

- **CMS_API_TOKEN**: generate a new one (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), update Render env, update the automation's stored token, then remove the old value everywhere.
- **CMS_PASSWORD**: independent — rotating this doesn't affect
  automation bearer auth.
- **CMS_COOKIE_SALT**: independent — rotating invalidates all active
  human sessions but doesn't affect bearer auth.
