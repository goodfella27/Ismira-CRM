# Ismira UI Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing platform styling with the approved Kobra-inspired design system, remove superseded styles, and provide authenticated live UI documentation.

**Architecture:** Build semantic theme tokens and a small typed shared component library first. Migrate presentation at its source, preserving feature state, API contracts, route authorization, and functional geometry. Keep one application-wide theme so menus and dialogs rendered in portals inherit the same appearance.

**Tech Stack:** Existing Next.js 16, React 19, Tailwind 4, Radix, CVA, Lucide; locally bundled Inter through `@fontsource-variable/inter`.

**Spec:** `docs/superpowers/specs/2026-09-30-ui-design-system-design.md` (approved 2026-09-30).

## Global Constraints

- Work on `codex/ui-design-system`, baseline `70b2ea6`; do not merge or deploy the UI without a later instruction.
- Preserve existing workflows, data, permissions, translations, and integrations.
- Remove superseded styling from its source instead of placing a new override layer over it.
- No Kobra Pro license or source has been supplied. Use original implementations composed from the project's existing shadcn-compatible React, Radix, and Tailwind stack.
- Use both light and dark token sets. Default to the system preference with a user theme control; persist an explicit preference.
- Locally bundled Inter variable, with system sans fallback and Latin/Cyrillic coverage; system monospace for code.
- 12px metadata, 14px body, 16px section heading, 24px page heading; public headings may use 32–40px.
- 4px base spacing: 4, 8, 12, 16, 24, 32, 48px. Controls: 36px default, 32px compact, 44px large/touch; 16px mobile input text.
- Corners: 6px controls, 10px panels, 14px dialogs. Motion: 120–180ms and reduced-motion support.
- Preserve meaningful business colors such as opening types and pipeline statuses.
- Do not submit a real candidate or trigger MailerLite messages during visual checks.

## Review Focus

1. Blocked storage or unavailable browser globals must not crash theme initialization; system preference must still work (Task 1).
2. Portaled overlays in dark mode must retain contrast, trap focus when modal, close on Escape, and return focus to the trigger (Tasks 2–3).
3. A non-admin must not gain documentation access through direct navigation; admin-only links must remain hidden from non-admin navigation (Tasks 3 and 9).
4. Long translated labels, long emails, narrow screens, and horizontally scrollable tables must not overflow the viewport (Tasks 4, 7–8).
5. A visual edit must not reset application values, silently save routing settings, change opt-out behavior, or break drag/drop (Tasks 4, 6, 8).

## File ownership and execution

Tasks run sequentially because controls, overlays, and tokens are shared. Commit each coherent task after its checks pass. Capture baseline screenshots of available authenticated and public screens before editing. Do not bypass authentication if browser access is unavailable; record which screens need user-assisted verification.

### Task 1: Theme, font, and global style cleanup

**Files:** Create `src/lib/theme.ts`, `src/components/theme-provider.tsx`, `test/theme.test.mjs`; modify `src/app/globals.css`, `src/app/layout.tsx`, `package.json`, `package-lock.json`.

**Interfaces:** `ThemePreference = 'system' | 'light' | 'dark'`; `resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark'`; `readThemePreference(storage: Pick<Storage, 'getItem'> | null): ThemePreference`. `ThemeProvider({children})` exposes `useTheme(): {preference, setPreference}`. Storage key: `ismira-theme`.

- [ ] Write theme tests using the existing Node/TypeScript VM convention: `resolveTheme('system', true) === 'dark'`; false resolves light; explicit light ignores dark system; unknown/missing stored value and a throwing `getItem` resolve to system.
- [ ] Run `node --test test/theme.test.mjs`; confirm missing implementation fails.
- [ ] Install the font package from the official npm registry and bundle Latin, Latin-ext, and Cyrillic subsets. Import locally; no runtime font request to Google.
- [ ] Implement safe pre-paint initialization and a provider that reacts to system changes only in system mode, supports cross-tab changes, catches unavailable storage, and cleans up listeners. Verify hydration does not flash the wrong theme.
- [ ] Replace global tokens with neutral semantic surfaces, text, borders, controls, success/warning/error and focus tokens. Set control/panel/dialog radii to 6/10/14px. Remove the mint body class and its navy override, stale font variables, and hardcoded white autofill treatment. Use theme-aware autofill styles without a new blanket override layer.
- [ ] Run theme tests and `npx tsc --noEmit`; inspect a public page in both themes. Commit the foundation.

### Task 2: Shared controls, layout, and feedback primitives

**Files:** Create `src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `combobox.tsx`, `checkbox.tsx`, `switch.tsx`, `radio-group.tsx`, `badge.tsx`, `avatar.tsx`, `separator.tsx`, `skeleton.tsx`, `alert.tsx`, `empty-state.tsx`, `table.tsx`, `pagination.tsx`, `page-header.tsx`, `section.tsx`, `toolbar.tsx` in that directory.

**Interfaces:** Button native props plus `variant: 'primary'|'secondary'|'ghost'|'destructive'`, `size: 'sm'|'md'|'lg'|'icon'`, `asChild?: boolean`, `pending?: boolean`; export `buttonVariants`. Inputs retain native attributes/ref. Select exposes Radix Root/Trigger/Value/Content/Item wrappers. Combobox accepts `options: {value:string,label:string}[]`, `value`, `onValueChange`, `label`, `disabled`. PageHeader accepts `title`, `description?`, `actions?`; Section accepts `title?`, `description?`, `actions?`, `children`. Other primitives wrap native/Radix props without changing data behavior.

- [ ] Implement controls with the Task 1 tokens, CVA variants, `cn`, and accessible labels/errors. Default Button to `type="button"`; submission callers must explicitly use submit. Pending buttons are disabled and expose busy state. Icon-only controls require an accessible name.
- [ ] Keep structural table elements semantic; put horizontal scrolling in Table's container. Match 36/32/44px controls and 16px mobile form text. Do not globally restyle all native elements.
- [ ] Verify keyboard selection, disabled states, long combobox options, invalid fields, and pending buttons in a temporary development preview; remove that preview after Task 9 supplies the real catalog.
- [ ] Run TypeScript and lint on the new directory; commit shared primitives. Reversible appearance alone does not need implementation-mirroring unit tests.

### Task 3: Accessible overlays and the application shell

**Files:** Create `src/components/ui/dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `tabs.tsx`, `src/components/theme-toggle.tsx`; modify `src/components/app-shell.tsx`, `app-sidebar.tsx`, `app-dialogs.tsx`, `details-modal-shell.tsx`, `task-notification-bell.tsx`, `filter-tooltip.tsx`, `chat-widget.tsx`, `src/app/breezy/shell.tsx`.

**Interfaces:** Radix-compatible overlay wrappers; `ThemeToggle()` uses Task 1 provider. Preserve `useAppDialogs().confirm(options): Promise<boolean>` and `.prompt(options): Promise<string|null>`; preserve `DetailsModalShell`'s existing public props. Add an optional screen-reader title to the shared dialog wrapper where needed.

- [ ] Replace manual modal framing with the shared overlay primitives while preserving results/cancel semantics. Do not retain a global Enter handler that overrides native focused-button behavior. Keep existing caller z-index overrides and detail panel dimensions functional.
- [ ] Replace sidebar decoration and framed canvas with a 240px sidebar, compact header, notification/theme controls, and 24/32px workspace gutters. Keep branding, profile, logout, and permission logic.
- [ ] Implement mobile navigation using a modal drawer with named trigger/close controls and focus restoration. Convert HR Portal navigation to compact tabs with a Radix overflow menu; preserve every existing destination.
- [ ] Restyle notification, chat, and tooltip surfaces using the same tokens; keep subscriptions and fetch behavior unchanged.
- [ ] Browser check: open each overlay in dark/light, Tab through it, press Escape, verify focus returns; verify mobile navigation at 390px and the non-admin sidebar. Run TypeScript, changed-file lint, existing route tests; commit.

### Task 4: Applications and routing settings

**Files:** Modify `src/app/breezy/applications/list.tsx`, `src/app/breezy/application-routing/settings.tsx`; preserve their server pages and APIs.

**Interfaces:** Consume Tasks 1–3 primitives; retain existing API request/response bodies and pagination of 25 applications.

- [ ] Replace local `button`/`control` class constants and repeated panels with shared controls and headers. Use readable application rows/details, compact metadata, clear empty/error/loading states, and consistent pagination.
- [ ] Present routing rules as aligned rows with a group select, use the shared Switch, and keep save/dirty/refresh/retry behavior unchanged. Preserve country references and the unsaved preview behavior.
- [ ] Run `node --test test/application-routing.test.mjs test/application-mailerlite.test.mjs test/application-submissions.test.mjs test/route-policy.test.mjs`.
- [ ] Browser verify authenticated empty/loading/error states, long emails, 390px layout, expanding a record, pagination, and unsaved preview. Do not save real routing changes or retry a live MailerLite delivery for a visual test. Commit.

### Task 5: Positions and the HR Portal subsections

**Files:** Modify `src/app/breezy/_components/position-records-browser.tsx`, presentation-bearing files under `src/app/breezy/{companies,positions,pools,pipelines,email-templates,testimonials,departments,questionnaires,custom-attributes,webhooks,candidates}/page.tsx`, `src/components/job-companies-admin.tsx`, `job-premium-details-panel.tsx`, `opening-type-order-controls.tsx`, `positions-page-skeleton.tsx`, `position-details-skeleton.tsx`, `wysiwyg-editor.tsx`.

**Interfaces:** Shared table/filter/overlay primitives; retain existing form handlers, record IDs, ordering, status meanings, details composition, and editor output HTML.

- [ ] Migrate toolbar, filters, list/table rows, record detail panel, and editing controls. In large files change presentation in sections, reviewing each diff; extract presentation components only when that reduces duplicated UI without moving data logic.
- [ ] Remove obsolete shadows, gradient decoration, structural hardcoded colors, and excessive radii. Preserve logos, hero images, editor content, opening-type colors, drag handles, and dimensions used for positioning.
- [ ] Run existing `test/breezy*.test.mjs` tests where present plus the full suite to cover sorting, company mapping, details, and opening types.
- [ ] Browser verify Positions search/filter/detail open-close, an editor cancel flow, menus and horizontal table scrolling in both themes. Make no production data edits. Commit.

### Task 6: Remaining CRM workspaces

**Files:** Modify `src/app/{leads,companies,pipeline,calendar,intake,company,profile}/page.tsx`, their `loading.tsx` files, `src/app/companies/components/AddCompanyModal.tsx`, `src/app/pipeline/components/{Board,Column,CandidateCard,CandidateDrawer,AddCandidateModal,EmailThread}.tsx`, `src/components/Skeleton.tsx`, `Markdown.tsx`.

**Interfaces:** Tasks 1–3 components; preserve all feature state, API calls, permissions, @dnd-kit transform styles, calendar grid geometry, and editor content.

- [ ] Migrate each route's headers, actions, forms, tables/board, empty/error/loading states, and detail overlays. Remove the pipeline dotted background and decorative gradients.
- [ ] Preserve business/status colors. Explicitly inspect candidate drawer, email preview/content, charts/calendar, and nested overlays so theme cleanup does not alter user-authored HTML or functional inline styles.
- [ ] Verify responsive table overflow and board scrolling; verify drag/drop on fixture data in a development-only test environment, not live candidate records. If fixtures are unavailable, record the unverified interaction rather than mutate real records.
- [ ] Run full existing tests, TypeScript, and changed-file lint; browser-check each route that is accessible with the existing authenticated session. Commit.

### Task 7: Authentication and public job browsing

**Files:** Modify `src/components/auth-layout.tsx`, `login-page-client.tsx`, `src/app/register/page.tsx`, auth/loading pages, `src/app/jobs/{jobs-board,sticky-jobs-header}.tsx`, `src/components/logo-stack-slider.tsx`, `src/app/not-found.tsx`, presentation in `src/app/job/page.tsx` and `src/app/jobs/embed/page.tsx`.

**Interfaces:** Shared tokens, controls, theme; retain auth redirect semantics, public URLs, embed behavior, filters, opening types, and job detail actions.

- [ ] Replace authentication's purple/mint styling and ornamental panels; retain company branding and existing imagery where useful. Remove hardcoded fake candidate counts/profile decoration from the login layout.
- [ ] Migrate jobs header, filters, cards/list, detail surfaces, and calls to action. Preserve useful job imagery and semantic opening-type colors; remove purely ornamental gradients and nested shadow framing.
- [ ] Inspect embed mounting styles in `public/embed` before changing its host assumptions. Change only presentation necessary for the shared visual system; preserve mount events, sizing, and external navigation contracts.
- [ ] Run `node --test test/public-shell-routes.test.mjs test/route-policy.test.mjs` and the other existing jobs tests. Verify logged-out auth, jobs filter/detail navigation and embed at 390/768/1440px in both themes. Do not create an account as a test. Commit.

### Task 8: Public application and token-based forms

**Files:** Modify `src/app/apply/{application-form,language-select}.tsx`, `src/app/form/[token]/page.tsx`, `src/app/cv/[token]/page.tsx`; leave translations and application/server rules unchanged unless an accessibility label requires a translated addition.

**Interfaces:** Task 2 fields/controls, Task 3 overlays, existing six-language dictionary and validation functions.

- [ ] Replace separate teal form styling with semantic steps, fields, progress and actions. Retain all four steps, full field visibility, selected values, citizenship flags, file checks, validation, and language switching.
- [ ] Migrate token form/CV screen presentation without changing upload paths, token validation, or submission logic. Keep file input native and accessible.
- [ ] Run `node --test test/application-form.test.mjs test/application-routing.test.mjs test/application-submissions.test.mjs`.
- [ ] Browser fill non-sensitive dummy values without final submission; switch through EN/LT/PL/UK/DE/RU and verify field retention, errors, keyboard dropdown navigation, long labels, mobile control text, and no viewport overflow. Commit.

### Task 9: Live design-system documentation and access

**Files:** Create `src/app/design-system/page.tsx`, `src/app/design-system/catalog.tsx`, `docs/ui-design-system.md`, `test/design-system-access.test.mjs`; modify `src/lib/auth/route-policy.ts`, `src/lib/public-shell-routes.ts`, `src/components/app-sidebar.tsx`, and related route tests.

**Interfaces:** Server page calls `getCurrentUserAccess()` before rendering. No session redirects to `/admin?next=/design-system`; non-admin redirects to `/breezy`. Catalog uses only fictional examples and shared components, with no candidate API calls.

- [ ] Write failing tests for protected/admin-only `/design-system` and descendants, false for `/design-system-other`, protected shell selection, and server-page redirect behavior using the repository's mocked-import test convention.
- [ ] Implement authorization, admin navigation entry, and live catalog sections for typography, spacing, colors, radii, controls and states, tables, navigation, overlays, feedback, responsive behavior, and accessibility. Include code usage snippets and theme selection.
- [ ] Document exact token values and component APIs in `docs/ui-design-system.md`, plus rules for semantic status colors and avoiding new one-off styles.
- [ ] Run new and existing route tests. Browser verify authorized catalog plus logged-out redirect, keyboard examples, both themes, and no real data requests. Commit.

### Task 10: Whole-platform audit and review

**Files:** Update this plan's checkboxes and `docs/ui-design-system.md` migration coverage; remove verified-unused old styling helpers only after reference search.

- [ ] Audit every presentation file for obsolete decoration, duplicated control definitions, hardcoded structural colors, and old utilities; distinguish necessary image overlays and business colors from legacy chrome. Do not use a bulk replace script.
- [ ] Run `node --test test/*.test.mjs`, `npx tsc --noEmit`, ESLint for all changed TS/TSX files, `git diff --check`, and `npm run build`. Investigate failures; do not claim the migration complete with unexplained failures.
- [ ] Verify representative authenticated/public flows at 390/768/1440px, both themes, keyboard-only navigation, reduced motion, long content, and portaled overlays. Record any inaccessible screens or unavailable fixture checks accurately.
- [ ] Capture before/after and final screenshots without exposing candidate personal data. Review the whole branch for UI regressions and unintended business-logic changes; use the execution method selected by the user.
- [ ] Commit verified UI changes on the feature branch and provide local preview/documentation links. Do not merge UI to main or deploy.

## Execution choice

Recommended: Native (implement sequentially in this session, with one independent whole-branch review). The work touches shared tokens, controls, and large feature files; a single implementer reduces conflicting changes while preserving their behavior. Subagent-driven execution is also available if the user prefers independent review after every task.


## Execution outcome (2026-09-30)

Tasks 1–9 are implemented on `codex/ui-design-system`. Coherent final commit replaces per-task commits so reviewed fixes and dependent primitives are recorded together. Theme and access tests followed red/green. Repetitive migration used audited AST-limited edits to style expressions and compact native controls; data, handlers, HTML content and business color maps were excluded.

Verification and limitations are recorded in `docs/ui-design-system.md`. The original task checkboxes above remain the planning checklist, not a claim that every live-data workflow has been manually exercised. Live candidate records were not accessed after automatic approval review blocked that browser inspection. Final acceptance of those workflows remains user-assisted before deployment.
