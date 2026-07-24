---
title: "Test Publish API Fixture Article"
h1: "Test Publish API Fixture Article"
slug: "test-publish-api-fixture"
section: "articles"
description: "Fixture article used to exercise the /api/publish-article endpoint. Passes all validation checks (slug, front-matter fields, char limits, body length, no scripts)."
faq:
  - q: "What is this article?"
    a: "This is a test fixture used by the /api/publish-article endpoint acceptance tests. It is not intended to be published as real content. If a PR named 'Draft article: test-publish-api-fixture' shows up in the repo, close it without merging and delete the branch."
  - q: "Why does the endpoint need a fixture?"
    a: "So the acceptance tests in TASK-publish-api.md can be exercised end-to-end without hand-crafting a valid front-matter block every time. The fixture guarantees the payload is well-formed so a failed test always indicates an endpoint problem, never a bad-input problem."
---

This is a fixture article used to verify that the `/api/publish-article` endpoint accepts a well-formed payload, creates a draft branch, opens a PR, and returns a 201 response with the PR URL.

The content below is intentionally long enough to satisfy the minimum body-length validation (≥ 2,000 characters after the front-matter). It does not contain any script tags, does not reference any real product, and is written so that if it accidentally lands in production it is obviously a test artifact rather than a claim about corporate compliance.

## Section one — validation coverage

The endpoint validates: slug kebab-case, front-matter presence, front-matter has title/slug/section/description, body slug matches front-matter slug, title length is at most 70 characters, description length is at most 165 characters, body length is at least 2,000 characters, and body does not contain a script tag. This fixture is constructed to pass all of those checks.

## Section two — why body length matters

The minimum body length rule is a cheap first-pass quality signal. It doesn't guarantee good content, but it filters out obviously incomplete or truncated generation output. Real articles on this site tend to run 1,500 to 3,000 words; the 2,000-character floor is a low bar that catches only the pathological cases where an automation truncated or errored mid-generation.

## Section three — why script tags are blocked

Any content that appears in the article body renders as HTML after markdown processing. Allowing script tags would create a stored XSS vector — the automation submits content, an admin merges the PR without noticing an embedded script, and the script runs in every visitor's browser. Blocking script tags at the API boundary is defense in depth: even if the front-matter check passes and the reviewer isn't paying full attention on merge, the endpoint refuses to accept the file in the first place.

## Section four — why the endpoint forces draft server-side

The task specifies that the endpoint must force draft regardless of the payload's status value. This is a safety property: even if the automation is compromised or malfunctions and starts sending status:published, the endpoint ignores the field and always creates a PR. The human review on merge is the only path to production. This makes the endpoint safe by construction rather than safe by convention.

## Section five — cleaning up after tests

After running acceptance tests 3, 4, and 5, delete the resulting draft PR by closing it without merging on GitHub, then deleting the draft-article/test-publish-api-fixture branch. Do not merge this PR. If merged accidentally, revert the commit and delete the resulting article file from content/articles/. The fixture slug 'test-publish-api-fixture' should never appear on the live site.

## Section six — safe to delete

This file lives at tests/fixtures/valid-article.md and exists purely to support endpoint tests. It is not referenced by any renderer, is not indexed by the sitemap, and does not appear on the live site under any URL. It can be safely deleted if the endpoint tests are considered a one-time verification and the fixture is no longer needed.
