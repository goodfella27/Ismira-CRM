# Missing Job Description Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill missing Supabase job description bodies from public posting pages without adding runtime Breezy API dependencies or hardcoded job data.

**Architecture:** The application remains Supabase-only at runtime. A one-time Node script queries Supabase for position rows missing visible body content, fetches the matching public posting page using a caller-provided source base URL, extracts structured `JobPosting.description` HTML, and updates only the missing body fields when run with `--apply`. The script is dry-run by default and prints a recoverable/skipped/error report before any write is allowed.

**Tech Stack:** Node.js ESM, `@supabase/supabase-js`, existing `.env.local`, public HTML/JSON-LD parsing, Node test runner.

## Global Constraints

- Do not call the Breezy API from app runtime.
- Do not hardcode job names, company names, or position ids.
- Read and write job bodies only through Supabase.
- Preserve existing Supabase overrides and local metadata.
- Default to dry-run; require `--apply` for writes.
- Verify with tests, TypeScript, and a post-run Supabase count.

---

### Task 1: Shared Backfill Helpers

**Files:**
- Create: `src/lib/public-job-description-backfill.mjs`
- Test: `test/public-job-description-backfill.test.mjs`

**Interfaces:**
- Produces: `hasVisibleBody(details: unknown): boolean`
- Produces: `buildPublicPostingUrl(baseUrl: string, row: object): string`
- Produces: `extractJobPostingDescription(html: string): { html: string; text: string } | null`
- Produces: `buildBackfilledDetails(row: object, extracted: object, sourceUrl: string, importedAt: string): object`

- [ ] **Step 1: Write failing tests**

```js
test("hasVisibleBody rejects empty html shells", () => {
  assert.equal(hasVisibleBody({ description: "<br>", html: "", content: "" }), false);
});

test("extractJobPostingDescription reads structured JSON-LD description", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    description: "<h1>Role</h1><ul><li>One</li></ul>",
  })}</script>`;
  assert.deepEqual(extractJobPostingDescription(html), {
    html: "<h1>Role</h1><ul><li>One</li></ul>",
    text: "Role One",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/public-job-description-backfill.test.mjs`

- [ ] **Step 3: Implement helpers**

Implement HTML visible-text detection, JSON-LD flattening, public URL building from `friendly_id` or `breezy_position_id + slug(name)`, and details merge that writes `description`, `html`, `content`, `source_url`, and `imported_from_public_portal_at`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/public-job-description-backfill.test.mjs`

### Task 2: Dry-Run-First Import Script

**Files:**
- Create: `scripts/backfill-missing-job-descriptions.mjs`

**Interfaces:**
- Consumes helpers from `src/lib/public-job-description-backfill.mjs`
- CLI flags: `--source-base-url=<url>`, `--apply`, `--limit=<n>`, `--include-unpublished`

- [ ] **Step 1: Query Supabase rows**

Load `.env.local`, create Supabase admin client, select `company_id,breezy_company_id,breezy_position_id,name,state,friendly_id,org_type,company,department,details,overrides,synced_at,details_synced_at` from `breezy_positions`, and filter missing body rows with `hasVisibleBody`.

- [ ] **Step 2: Fetch public pages**

For each missing row, build the public URL, fetch it, parse `JobPosting.description`, and classify each row as `recoverable`, `skipped`, or `error`.

- [ ] **Step 3: Apply only when explicit**

When `--apply` is present, update only `details`, `details_synced_at`, and `synced_at` for the exact `(company_id,breezy_position_id)` row. Without `--apply`, print the same update preview without writing.

- [ ] **Step 4: Print summary**

Print totals by company plus first errors/skips. Exit nonzero only for configuration/database failures, not for public pages that no longer exist.

### Task 3: Verification

**Files:**
- No new files.

**Interfaces:**
- Consumes script output and existing app routes.

- [ ] **Step 1: Run dry-run**

Run: `node scripts/backfill-missing-job-descriptions.mjs --source-base-url=https://ismira.breezy.hr`

- [ ] **Step 2: Review counts**

Confirm recoverable rows and skipped rows. Do not write until the dry-run output looks correct.

- [ ] **Step 3: Run apply**

Run only after approval: `node scripts/backfill-missing-job-descriptions.mjs --source-base-url=https://ismira.breezy.hr --apply`

- [ ] **Step 4: Verify missing count**

Re-run the dry-run and confirm the missing count drops to only unrecoverable rows.

- [ ] **Step 5: Spot-check UI**

Open one recovered job in `/jobs` and `/breezy/positions`. Confirm both render the same structured body from Supabase.
