# Navigation performance and local data

## Changes

- The runtime no longer authenticates to or fetches the Breezy API. Legacy identifiers and `/breezy` route names remain to avoid breaking stored relationships and links.
- Templates, imported candidate search, pipelines and questionnaires use Supabase. CandidateDrawer refreshes stored records and attachments without remote repair/synchronization requests.
- Remote-only imports, exports to Breezy, webhook/custom-field settings, and missing remote-file retrieval return an explicit retired-integration response rather than hanging, falling back to Breezy, or claiming successful synchronization.
- HR/Company screens share a bounded, in-memory, 30-second GET cache owned by the mounted workspace. Repeat visits reuse responses; simultaneous reads are deduplicated. A consumer abort does not cancel another consumer's request. Errors are not cached. Mutations invalidate before and after completion. Explicit Refresh bypasses the cached view. Focus/visibility return and auth changes clear the cache; teardown unsubscribes and discards it. Cache expiry causes a fresh request on the next read; this is not a general background revalidation layer. No response data is saved to localStorage or shared across server requests.
- The HR layout reuses the shell's permission result instead of making another blocking server lookup. Protected route checks and API authorization remain enforced. Public content and icons skip irrelevant proxy authentication requests.
- Server-render access resolution uses request-scoped React cache, and membership/portal queries run concurrently. No cross-request authorization cache was introduced.
- HR navigation links go directly to positions, avoiding an intermediate redirect. A loading boundary provides navigation feedback while a new route loads. The position text editor is a separate lazy-loaded bundle.
- Job-company enrichment runs independent reads in parallel. Missing benefits are derived from stored descriptions without writing during GET or re-reading the benefits table. Full company responses retain effective countries and benefits. An optional `?view=lookup` supplies stored metadata/logos for future lightweight consumers; current editor callers retain full responses because they need derived values.

## Evidence

Local development logs before changes included `/companies` at 4.3s (4.0s compilation), position reads at 2.4s (1.7s compilation), and job-company enrichment at 2.8–3.1s excluding compilation.

The installed native Next.js compiler package lacked its `.node` binary. A fresh official `@next/swc-darwin-arm64@16.1.6` archive matching the lockfile was installed locally. Native loading was verified, the dev server restarted, and the production build compiled in 17 seconds (final incremental verification: 11.9 seconds). Development now defaults to Turbopack; `npm run dev:webpack` remains available as a fallback. Turbopack started in 810ms, with warm public page HTTP responses around 35–44ms. This repairs the local dependency installation; no binary is committed.

The local production preview returned `/apply` in 51ms on its first measured request and 5ms on a repeat; `/icon` measured 12ms and 4ms respectively. These are public HTTP response times on this machine, not browser paint measurements or authenticated database latency guarantees.

Mocked company endpoint regression tests: full request reduced from 10 enrichment reads plus 2 benefit writes to 8 reads and no benefit writes; position scans reduced from 2 to 1. Membership bootstrap behavior is unchanged. The optional lookup performs 2 table reads plus logo signing when needed.

## Verification limits

104 tests pass. Tests cover cache reuse/invalidation/abort isolation, auth lifecycle cleanup, protected proxy behavior, parallel access checks, local-only endpoint behavior, and company benefit derivation. TypeScript and production build pass. No live candidate data was inspected or modified. The public production form was verified in the in-app browser. Chrome catalog automation timed out; authenticated navigation still needs a user acceptance pass.

Restoring the npm dependency tree activated newer React Hooks lint checks already represented by the lockfile. The same changed files at the baseline commit report 543 lint errors; this implementation reports 509 in the same lint run, with no per-file increase over baseline. These existing effect/ref/compiler diagnostics need a separate cleanup; they are not suppressed here.

Development mode still compiles cold routes on demand. For a realistic speed comparison use a production build (`npm run build`, then `npm start`) rather than comparing the first development visit to a warm production page. The cache makes recent repeat visits fast; uncached authenticated data still requires network requests.
