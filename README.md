# Ismira Intake – Prototype

This project is a Next.js App Router prototype that includes a MailerLite leads view and an ATS-style Pipeline board (Kanban) for CEO demos.

## Getting Started

```bash
npm run dev
```

Open `http://localhost:3000`.

## Pipeline (Demo)

Route: `/pipeline`

Features:
- Kanban board with draggable candidate cards (dnd-kit)
- Column counts update instantly
- Filters: status and pool
- Add Candidates modal
- Candidate drawer with notes
- Local persistence via `localStorage`

Mocked data:
- Stages and pools are static in `src/app/pipeline/data.ts`
- 60+ seeded candidates on first load

Notes:
- Drag and drop persists locally
- This is a prototype (no backend yet)

## Next steps for production

- Replace local storage with Supabase tables
- Add server-side auth & role permissions
- Add full candidate search and analytics
- Connect MailerLite / form intake

