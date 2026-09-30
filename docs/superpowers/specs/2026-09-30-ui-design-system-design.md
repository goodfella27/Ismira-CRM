# Ismira UI design system

Status: ready for design review; implementation has not started.
Branch: `codex/ui-design-system`
Baseline: `70b2ea6`, merged and pushed to `main`.

## Outcome

Replace the platform's current visual styling with a coherent Kobra-inspired UI, including an internal component documentation page. The user's reference is https://kobra.systems/components/plan-card. Preserve existing workflows, data, permissions, translations, and integrations. Remove superseded styling from its source instead of placing a new override layer over it.

No Kobra Pro license or source has been supplied. Use original implementations composed from the project's existing shadcn-compatible React, Radix, and Tailwind stack. Do not copy gated source or make purchases. This is a visual-system migration, not an implementation of the reference's AI plan-approval workflow.

## Existing platform audit

- Next.js 16, React 19, Tailwind 4, Radix, CVA, Lucide, and shadcn configuration already exist.
- There is no `src/components/ui` directory. Controls are independently styled inside pages and feature components.
- `globals.css` defines shadcn variables, but many screens bypass them with hardcoded colors, dimensions, and shadows.
- The root body uses a mint utility that a global selector overrides with a dark navy background. Remove both.
- The CRM shell has a dark gradient/dotted sidebar, large inset rounded workspace, and oversized navigation tiles. Replace these with a quiet, compact workspace.
- The public application form uses a separate teal palette, and the login screen uses another purple palette.
- Font variables are named Geist, but currently resolve to system fonts. Establish one explicit font policy.
- Application routing and Applications contain repeated local button/input class strings. Replace them with shared controls.

## Design direction

Visual thesis: precise, neutral, softly layered surfaces with compact typography, subtle borders, and tactile buttons, inspired by the Kobra reference.

Use color sparingly for meaning. Retain Ismira branding and company logos; remove ornamental green gradients, dotted textures, excessive pill shapes, and oversized shadows from operational UI.

Use both light and dark token sets. Default to the system preference with a user theme control; persist an explicit preference. Both themes must cover portal overlays as well as page surfaces. Native controls must follow the active color scheme. Public pages use the same system with their existing content and imagery.

### Foundations

| Foundation | Proposed standard |
| --- | --- |
| Typeface | Locally bundled Inter variable, with system sans fallback and Latin/Cyrillic coverage; system monospace for code |
| Text | 12px metadata, 14px body, 16px section heading, 24px page heading; public headings may use 32–40px |
| Weights | 400 regular, 500 medium, 600 semibold |
| Line height | 1.5 body, 1.2 headings |
| Spacing | 4px base: 4, 8, 12, 16, 24, 32, 48px |
| Controls | 36px desktop default, 32px compact, 44px large/touch; 16px text on mobile form inputs |
| Corners | 6px controls, 10px panels, 14px dialogs; circles reserved for avatars/status markers |
| Borders | 1px semantic border, separate stronger control border |
| Shadows | Small control relief, elevated overlays only; no decorative workspace shadows |
| Icons | Lucide, normally 16px; 18–20px where the icon is the primary control |
| Motion | 120–180ms hover/focus/expansion; respect reduced-motion preference |

Semantic tokens cover background, surface, muted surface, text, muted text, border, input, primary, accent, destructive, success, warning, focus ring, overlay, spacing, and radius. No component should depend on literal green, slate, or navy values for structural styling. Preserve meaningful business colors such as opening types and pipeline statuses.

### Shared components

Create a small reusable library in `src/components/ui`:

- Button and button-link variants: primary, secondary, ghost, destructive; consistent sizes and pending states.
- Input, textarea, label, select/combobox, checkbox, switch, radio controls, field hints and errors.
- Badge, avatar, separator, skeleton, alert, and empty state.
- Dialog, dropdown menu, popover, tooltip, and tabs using accessible Radix primitives where appropriate.
- Table, pagination, toolbar, page header, and section layout for dense CRM screens.

Use composition and typed props. Preserve labels, native form semantics, focus visibility, keyboard navigation, and disabled behavior. Replace repeated class constants with the new components. Share variants rather than introducing parallel public/admin button libraries.

### Workspace and navigation

Replace the current framed canvas with a full-height workspace and a compact approximately 240px sidebar. Use text and single icons rather than nested icon tiles and subtitle-heavy navigation. Keep all existing destinations accessible, including admin-only routes under their current permission checks.

Use a compact header for page context, theme control, and existing notifications. HR Portal navigation becomes compact tabs with an accessible overflow menu. On narrow screens use a keyboard-accessible navigation drawer and keep tables horizontally scrollable inside their own container.

Retain current route paths, including `/breezy`, during this visual migration. Remove obsolete visible references such as “ATS connection” where they misdescribe the local application workflow. Do not delete integration features or database records as part of styling cleanup.

## Cleanup and migration boundaries

First remove obsolete global overrides and isolate the new tokens and base styles. Then replace each component's old class definitions as its new implementation lands. Do not leave the platform intentionally unstyled between separate deliverables. Each migrated area must be functional and visually coherent before moving on.

Avoid broad CSS selectors that override arbitrary descendants, `!important` theme patches, blind color substitutions, or deleting functionality to simplify the redesign. Keep functional geometry such as drag/drop positioning, calendar sizing, editor dimensions, progress widths, and image aspect ratios.

Remove unused visual helpers/assets only after checking imports and runtime references. Keep company branding, country flags, public job imagery, and data-dependent presentation.

## Coverage and execution order

1. Foundations and cleanup: tokens, font loading, theme, shared controls, obsolete body/autofill/background styling.
2. Shared shell: sidebar, mobile navigation, HR Portal tabs, notifications, dialogs, and auth screens.
3. First complete operational flows: Applications, Application routing, and Positions. These establish forms, settings, table/list density, and detail overlays.
4. Remaining internal routes: Leads, Companies, Pipeline, Calendar, Intake, Company settings, Profile; all HR Portal subsections and shared record/detail components.
5. Public screens: jobs list/detail/embed, application form, registration, and token-based forms/CV views. Preserve embedding and six-language behavior.
6. Internal `/design-system` documentation with live examples, token reference, component states, responsive guidance, accessibility rules, and code usage examples. Restrict it to authenticated admins using the existing route policy and server authorization; use fictional examples, never live candidate data.

The first three steps provide an early visual review point. The complete requested migration includes the remaining steps; do not label the whole platform migrated while old screens still depend on their previous visual system.

## Verification and acceptance

- Existing 80 tests and TypeScript checks pass; lint all changed files and run the production build.
- Add meaningful coverage for new theme behavior and documentation authorization; reuse existing behavioral tests for form submission and routing.
- Verify authenticated desktop and mobile navigation, menu keyboard handling, dialog focus/escape behavior, table overflow, loading/error/empty states, and both themes.
- Verify the application form in all six languages, long translations, country flags, validation, step navigation, and selected-value retention. Do not submit a real candidate or trigger MailerLite messages during visual checks.
- Check representative screens at 390px, 768px, and 1440px widths, including a keyboard-only pass and reduced-motion preference.
- Confirm no horizontal page overflow, unreadable disabled controls, low-contrast secondary text, or unthemed portaled menus/dialogs.
- Audit migrated source for obsolete decoration and one-off structural colors. Explain any intentionally retained business/status colors.
- Provide before/after screenshots and links to the live design-system page and key migrated screens.

Keep UI work isolated on this branch for review. The user authorized merging and pushing the preceding application work; the new UI is an experiment and should not be merged to main or deployed without a later instruction.
