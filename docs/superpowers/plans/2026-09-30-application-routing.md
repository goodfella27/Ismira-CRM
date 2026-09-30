# Application communication routing

Goal: Route complete applications to configurable MailerLite communication groups without changing recruitment access, hiding fields, or rejecting on citizenship.

Source: country_eligibility_ismira.pdf supplied by the user. Green and red lists are communication segments; unknown countries remain explicitly unlisted.

- [x] Add exact PDF country sets and a deterministic communication rule classifier with tests.
- [x] Implement storage for admin-only settings and a durable MailerLite delivery queue in Supabase with RLS and no public access.
- [x] Add an authenticated Application routing page, live group selection, rule preview, and delivery retry controls.
- [x] Store all communication segments locally in Supabase, atomically queue MailerLite delivery, and surface retryable delivery failures to admins.
- [x] Verify validation, permissions, mapping, failure handling, type checking, lint, and browser behavior.

Rules: under-18 follow-up; red-list follow-up; unlisted-country follow-up; green-list/no experience or A1–A2 improvement; green-list/experience and B1–C1 main collection. All destinations are configurable. No group membership removes other MailerLite memberships or changes subscriber opt-out status. Existing MailerLite automations are not edited.

Settings are disabled until an admin selects and saves all five destinations. The UI recommends existing group names but never creates or activates email campaigns. Queue retries are available to admins; no credentials or subscriber payloads are public.

Verification: 80 repository tests, TypeScript, and scoped ESLint pass. Migration applied successfully through the SQL Editor in ckumubzfjkmhywsmerbt on 2026-09-30. The pasted query contained four obsolete duplicate statements; removing those made it match the local migration. Supabase returned “Success. No rows returned”.

Submissions go exclusively to application_submissions plus private application-cvs storage; no Breezy call remains in the submission route. Added admin Applications list and protected CV download; legacy jobs/form redirects to /apply. The MailerLite mapping remains disabled until configured by an admin. No real application or email was submitted during verification.
