# Task: Add a draft-article publish API to the CRS website

## Context (read first)

This site's articles are markdown files with YAML front-matter (`title`, `h1`, `slug`, `section`, `description`, optional structured `faq:` list that the rendering pipeline turns into FAQ JSON-LD). See any existing file in the articles content directory for the format — e.g. `corporate-by-laws-canada.md`.

An external automation (Claude, running on a weekly schedule) will generate new SEO articles in exactly that format and POST them to this site. Your job: build the receiving endpoint. The automation NEVER publishes directly — everything lands as a draft for human review.

## Endpoint spec

`POST /api/publish-article`

Headers: `Authorization: Bearer <PUBLISH_API_KEY>` (from env; generate with `openssl rand -hex 32`), `Content-Type: application/json`

Request body:
```json
{
  "slug": "what-is-cores-alberta",
  "markdown": "<entire .md file content, front-matter included>",
  "status": "draft"
}
```

Behavior:
1. **401** if the bearer key doesn't match `process.env.PUBLISH_API_KEY` (timing-safe compare).
2. **422** with a `problems[]` array if: slug isn't kebab-case; markdown lacks front-matter; front-matter is missing `title`/`slug`/`section`/`description`; front-matter `slug` ≠ body `slug`; `title` > 70 chars; `description` > 165 chars; body < 2,000 chars; body contains `<script` tags.
3. **409** if an article with that slug already exists (drafts included) — retried jobs must never create duplicates.
4. **Force draft server-side** regardless of the payload's `status` value. Use whatever draft mechanism fits this codebase best: a `draft: true` front-matter flag the article routes filter out, a separate `content/drafts/` directory, or (if content is git-based and deploys from main) open a PR instead of committing to main — the PR review then IS the approval step. Choose the one that matches how this repo currently builds/renders articles, and document the choice in the endpoint file.
5. **201** response: `{ "ok": true, "status": "draft", "slug": "...", "review": "<where the human reviews it: draft URL or PR URL>" }`.

## Also add

- A tiny `GET /api/publish-article/health` returning `{ok:true}` (no auth) so the automation can verify connectivity before posting.
- A README note (or comment block) documenting: the env var, how to review/approve a draft, and how to rotate the key.

## Reference implementation (adapt, don't copy blindly)

A reference Next.js App Router route with the auth/validation/duplicate logic already written exists in the file `publish-article-endpoint.ts` (provided alongside this brief). Adapt its two TODO functions — `slugExists()` and `saveDraftArticle()` — to this repo's actual content storage. If this repo isn't Next.js App Router, port the same logic to the framework in use.

## Acceptance tests (run these before calling it done)

```bash
# 1. No auth → 401
curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/publish-article -d '{}'

# 2. Bad payload → 422 with problems[]
curl -s -X POST localhost:3000/api/publish-article \
  -H "Authorization: Bearer $PUBLISH_API_KEY" -H "Content-Type: application/json" \
  -d '{"slug":"Bad Slug!","markdown":"no front matter","status":"draft"}'

# 3. Valid article → 201, file lands as draft, NOT visible on the live articles list
# (use tests/fixtures/valid-article.md content as the markdown value)

# 4. Same slug again → 409

# 5. Payload with "status":"published" → still created as draft
```

Create `tests/fixtures/valid-article.md` from an existing article file with the slug changed to `test-publish-api-fixture`, and clean the fixture draft up after test 3–5.

## Out of scope

No UI changes, no auto-publish path, no image handling (articles reference images by path; those are added at review time), no changes to existing articles.
