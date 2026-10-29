# Company Website Visibility Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Include current and future company JDs on the website without changing individual selections.
**Architecture:** Store job_company_show_all_on_ismira_web in job_companies.metadata; resolve effective visibility after company membership expansion and branding. Save through a tenant-authorized endpoint and expose through the existing company listing.
**Tech Stack:** Next.js, TypeScript, React, Supabase, Node test runner.
**Spec:** docs/superpowers/specs/2026-10-29-company-website-visibility.md

## Global Constraints
Preserve JD overrides, opening types, published/position eligibility, and existing company resolution. No dependencies or schema migration. Work on requested features/bulk_web branch.

## Review Focus
- Toggle off leaves individual selections visible.
- Future JDs inherit visibility without writes to JDs.
- Company rows grouped in one card stay consistent.
- Tenant mismatch and malformed requests cannot update settings.
- JD detail visibility and website headings agree with list visibility.

## Tasks
- [x] Add failing regression tests for the visibility truth table, company API persistence, and public feed behavior.
- [x] Add src/lib/job-company-website-visibility.ts and a company website-visibility POST route. Preserve unrelated metadata and clear jobs cache.
- [x] Expose showAllOnIsmiraWeb in company GET and add an immediate-save switch in job-companies-admin.tsx.
- [x] Resolve effective visibility in public jobs list and detail branding before filtering. Preserve individual priority resolution.
- [x] Run focused regression tests, TypeScript, lint, and review the diff; fix confirmed regressions.

## Execution notes
User explicitly authorized implementation after approving behavior; proceed inline without another approval round. Existing branch is clean and dedicated to this task.

## Verification
- All 141 Node regression tests passed.
- TypeScript no-emit check passed.
- Targeted ESLint: zero errors; 13 existing warnings in touched files.
- Independent review found a secondary-company detail visibility gap; added a failing regression, fixed it, and reviewer confirmed resolution.
- No live data was changed and no deployment was performed. Browser verification was not performed; no local server was running.
