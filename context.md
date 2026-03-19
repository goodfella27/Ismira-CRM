# Project Context — Ismira Intake Dashboard (Next.js + Supabase) + MailerLite ↔ Breezy

> **Goal:** Build an internal web app for **Ismira** that:
> 1) imports / syncs **MailerLite subscribers** into the app,
> 2) turns interview **transcripts** (from Notta or pasted text) into structured candidate profiles,
> 3) pushes candidates and notes/metadata to **Breezy HR** via API,
> 4) optionally keeps Breezy up-to-date when a subscriber moves between MailerLite Groups/Segments.

---

## 1) Tech Stack

### Frontend
- **Next.js (App Router)** + TypeScript
- **Tailwind CSS**
- **shadcn/ui** components (dialogs, tables, forms, toasts)
- Optional: TanStack Table for candidate/subscriber tables

### Backend
- **Supabase** (Postgres + Auth + Storage + Edge Functions)
- **Supabase Edge Functions** for:
  - MailerLite webhooks ingestion
  - Breezy API calls (server-side, keep tokens secret)
  - Transcript processing + AI extraction
  - Scheduled sync jobs (cron via Supabase Scheduled Triggers or external cron)

### External Services
- **MailerLite** API + Webhooks
- **Breezy HR** v3 API
- (Optional) **Notta** as transcript source (file upload / copy-paste). You can avoid Notta API by accepting transcript text/file.

---

## 2) Core Product Concepts

### A) Subscriber (from MailerLite)
A person in MailerLite (email-first). Used as a **lead** and can later become a **candidate** in Breezy.

### B) Transcript
A text artifact representing an interview/consultation.

### C) Candidate Profile (Internal)
A structured profile generated from transcript:
- summary
- extracted fields (metadata)
- confidence + evidence snippets
- review/edit workflow
- “Send to Breezy” action

### D) Breezy Candidate
A record created/updated in Breezy HR:
- create candidate
- attach note/stream entry (summary + next steps + transcript link)
- set custom fields / custom attributes
- optionally upload transcript as document

---

## 3) Data Model (Supabase / Postgres)

> Table names are suggestions. Use RLS for internal-only access.

### `organizations`
- `id` (uuid, pk)
- `name`
- `created_at`

### `app_users`
- `id` (uuid, pk, = auth.users.id)
- `organization_id` (fk)
- `role` (enum: admin, recruiter, viewer)
- `created_at`

### `mailerlite_subscribers`
- `id` (uuid, pk)
- `organization_id` (fk)
- `mailerlite_subscriber_id` (text, unique per org)
- `email` (text, indexed)
- `name` (text, nullable)
- `phone` (text, nullable)
- `country` (text, nullable)
- `status` (text: active/unsubscribed/etc.)
- `fields_json` (jsonb) — raw custom fields from MailerLite
- `groups` (jsonb) — list of groups (id + name)
- `segments` (jsonb) — optional
- `last_synced_at` (timestamptz)

### `transcripts`
- `id` (uuid, pk)
- `organization_id` (fk)
- `source` (enum: notta, paste, upload)
- `language` (text, nullable)
- `raw_text` (text) OR store in Storage and keep pointer
- `storage_path` (text, nullable)
- `created_by` (uuid fk app_users)
- `created_at`

### `candidate_profiles`
- `id` (uuid, pk)
- `organization_id` (fk)
- `transcript_id` (fk)
- `mailerlite_subscriber_id` (fk, nullable) — if linked
- `status` (enum: draft, reviewed, sent, failed)
- `summary` (text)
- `next_steps` (text)
- `extracted_json` (jsonb) — structured fields + confidence + evidence
- `reviewed_by` (uuid fk app_users, nullable)
- `reviewed_at` (timestamptz, nullable)
- `breezy_candidate_id` (text, nullable)
- `breezy_position_id` (text, nullable)
- `send_attempts` (int default 0)
- `created_at`

### `integration_credentials`
- `id` (uuid, pk)
- `organization_id` (fk)
- `provider` (enum: mailerlite, breezy)
- `encrypted_json` (jsonb) — store API keys/tokens encrypted (or use Supabase Vault)
- `created_at`

### `sync_logs`
- `id` (uuid, pk)
- `organization_id` (fk)
- `type` (enum: mailerlite_pull, mailerlite_webhook, breezy_push, breezy_refresh)
- `status` (enum: success, failed)
- `payload_json` (jsonb)
- `error` (text, nullable)
- `created_at`

---

## 4) Key Flows

### Flow 1 — Pull all MailerLite subscribers into the app
**Trigger:** Admin clicks “Sync MailerLite” or scheduled job runs.

1. Edge Function `mailerlite_sync_full`
2. Fetch subscribers pages from MailerLite API
3. Upsert into `mailerlite_subscribers`
4. Store groups/fields
5. Write `sync_logs`

**Notes**
- Prefer incremental sync after initial full import (by updated_at if available).
- If MailerLite segments are required, consider:
  - periodic segment membership sync
  - or group-based automation for real-time webhook triggers

---

### Flow 2 — Show MailerLite subscriber popup (in-app)
**UI:** On the Leads page, user clicks a subscriber row → opens a **Dialog (popup)** with:

- subscriber identity (email, name, phone)
- MailerLite groups/segments badges
- custom fields table
- quick actions:
  - “Create Candidate Profile from Transcript”
  - “Link to existing Candidate Profile”
  - “Mark as Ready to Push” (optional internal tag)

Implementation:
- Next.js page loads subscriber list (server component) with pagination/search
- Dialog content fetches full record via Supabase query (client-side) or server action
- Use shadcn/ui: `Dialog`, `Tabs`, `Badge`, `Table`, `Button`

---

### Flow 3 — Create Candidate Profile from transcript
**Input:** transcript text/file + optional linked subscriber.

1. Save transcript to `transcripts` (raw text or Storage)
2. Edge Function `ai_extract_candidate_profile`
3. AI returns:
   - summary
   - structured fields (schema below)
   - confidence + evidence (snippets)
4. Store in `candidate_profiles` as `draft`
5. User reviews/edits fields → status `reviewed`

---

### Flow 4 — “Send to Breezy”
**Trigger:** user clicks “Send to Breezy” button.

1. Edge Function `breezy_send_candidate`
2. Perform dedupe:
   - search Breezy candidate by email (preferred) / phone
   - if exists → update candidate + append note + update custom fields
   - else → create candidate in chosen position
3. Add note/stream:
   - summary, next_steps, key bullets
   - include link to transcript (Supabase Storage signed URL) if desired
4. Set custom fields/attributes in Breezy to match extracted schema
5. Optionally upload transcript as document
6. Update `candidate_profiles` with `breezy_candidate_id`, status `sent`
7. Log action in `sync_logs`

---

### Flow 5 — MailerLite Group/Segment → Breezy Candidate update (optional)
**Trigger:** MailerLite webhook: subscriber added to group.

1. Edge Function `mailerlite_webhook`
2. Validate webhook (signature if available)
3. Determine mapping: group → Breezy action:
   - update Breezy custom field `ml_group`
   - add Breezy stream note (“Added to group X”)
   - optionally move stage
4. Store log

---

## 5) Candidate Extraction Schema (Internal → Breezy mapping)

Create a fixed schema to keep AI output consistent.

### Suggested internal fields
- `full_name`
- `email`
- `phone`
- `nationality`
- `current_city`
- `current_country`
- `preferred_role` (e.g., bartender, housekeeping)
- `english_level` (A1–C2 or 1–5 scale)
- `experience_summary`
- `years_experience`
- `availability_date`
- `documents`:
  - `passport` (present/missing/unknown)
  - `seaman_book`
  - `medical`
  - `certificates` (list)
- `salary_expectation`
- `red_flags` (list)
- `next_step_recommendation`
- `evidence` per field: snippet (+ timestamp if available)
- `confidence` per field: high/med/low

### Breezy mapping strategy
- Put short human summary into **Breezy stream note**
- Put structured fields into **Breezy custom fields / custom attributes**
- Avoid storing sensitive or unnecessary data (data minimization)

---

## 6) Integrations: What you need

### MailerLite
- API key (store server-side only)
- Webhook endpoint URL (Edge Function)
- Decide whether you use:
  - **Groups** for event-driven updates (recommended)
  - **Segments** for periodic sync

### Breezy HR
- Breezy API credentials for a dedicated “service account” user
- Token acquisition via `/v3/signin` (server-side)
- You need:
  - `company_id`
  - `position_id` strategy (single pool vs role-based positions)
- Custom fields configured in Breezy to match your schema

---

## 7) Security & GDPR Notes (practical)

- Never call Breezy/MailerLite APIs from the browser (no secrets in client).
- Store secrets in Supabase secrets / vault.
- Use RLS so only Ismira staff can access their org data.
- Provide retention policy:
  - store only what is necessary
  - optionally store full transcript in Storage and keep only link + summary in Breezy
- Ensure lawful basis + transparency to candidates if calls are recorded/transcribed.

---

## 8) Environment Variables / Secrets

### Next.js
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Supabase Edge Functions secrets
- `MAILERLITE_API_KEY`
- `BREEZY_EMAIL`
- `BREEZY_PASSWORD`
- (optional) `OPENAI_API_KEY` or chosen LLM provider
- `APP_BASE_URL` (for generating signed links)

---

## 9) Pages / UI (Minimal)

### `/leads`
- Table of MailerLite subscribers
- Search + filters by group
- Row click opens **Subscriber Popup**:
  - subscriber details
  - groups/fields
  - actions: “Create profile”, “Link transcript”

### `/intake`
- Upload/paste transcript
- Select subscriber (optional)
- Run AI extraction
- Review/edit extracted fields
- Button: “Send to Breezy”

### `/profiles`
- List of generated profiles (draft/reviewed/sent/failed)
- Retry failed sends
- View logs

### `/settings/integrations`
- Connect MailerLite (store API key)
- Connect Breezy (service credentials)
- Map:
  - default `position_id`
  - group → stage/custom-field mapping

---

## 10) Milestones (Build Order)

1) Supabase setup + Auth + RLS + tables
2) MailerLite full import (manual sync button)
3) Leads page + popup
4) Transcript upload/paste + storage
5) AI extraction function + profile review UI
6) Breezy push (create candidate + note + custom fields)
7) Webhook-based updates (MailerLite → Breezy) + logs
8) Hardening: dedupe, retries, rate limits, audit logs

---

## 11) Open Questions (decide early)

- Breezy structure: one “Applicants” pool or multiple positions per role?
- Which MailerLite groups/segments should drive Breezy fields/stage?
- Do you store full transcript in Breezy as a document or only a link?
- What retention period for transcripts in Supabase Storage?
- Which exact custom fields exist/should be created in Breezy?
