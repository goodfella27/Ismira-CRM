import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBackfilledDetails,
  buildPublicPostingUrl,
  extractJobPostingDescription,
  hasVisibleBody,
} from "../src/lib/public-job-description-backfill.mjs";

test("hasVisibleBody rejects empty html shells", () => {
  assert.equal(hasVisibleBody({ description: "<br>", html: "", content: "" }), false);
  assert.equal(hasVisibleBody({ description: "<p>&nbsp;</p>" }), false);
});

test("hasVisibleBody accepts structured html or plain content with visible text", () => {
  assert.equal(hasVisibleBody({ html: "<h1>Role</h1><p>Body</p>" }), true);
  assert.equal(hasVisibleBody({ content: "Plain body" }), true);
});

test("extractJobPostingDescription reads structured JSON-LD description", () => {
  const page = `<html><head><script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    description: "<h1>Role</h1><ul><li>One</li></ul>",
  })}</script></head></html>`;

  assert.deepEqual(extractJobPostingDescription(page), {
    html: "<h1>Role</h1><ul><li>One</li></ul>",
    text: "Role One",
  });
});

test("extractJobPostingDescription removes public application footer", () => {
  const page = `<script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    description:
      "<h1>Role</h1><p>Body</p><p>You can submit your Resume here pushing APPLY TO POSITION button above<br></p><p>Last updated: today</p>",
  })}</script>`;

  const result = extractJobPostingDescription(page);
  assert.equal(result?.html, "<h1>Role</h1><p>Body</p>");
  assert.equal(result?.text, "Role Body");
});

test("buildPublicPostingUrl uses friendly id when available", () => {
  assert.equal(
    buildPublicPostingUrl("https://example.test/", {
      friendly_id: "abc123-role-title",
      breezy_position_id: "abc123",
      name: "Role Title",
    }),
    "https://example.test/p/abc123-role-title"
  );
});

test("buildPublicPostingUrl falls back to position id and slugified name", () => {
  assert.equal(
    buildPublicPostingUrl("https://example.test", {
      breezy_position_id: "abc123",
      name: "Senior Crew Role",
    }),
    "https://example.test/p/abc123-senior-crew-role"
  );
});

test("buildBackfilledDetails preserves existing metadata and writes body fields", () => {
  const importedAt = "2026-08-03T10:00:00.000Z";
  const details = buildBackfilledDetails(
    {
      breezy_position_id: "abc123",
      name: "Sample Role",
      state: "published",
      org_type: "position",
      company: "Sample Company",
      department: "Deck",
      friendly_id: "abc123-sample-role",
      details: {
        benefit_tags: ["free-accommodation"],
        show_on_ismira_web: true,
      },
    },
    { html: "<h1>Role</h1>", text: "Role" },
    "https://example.test/p/abc123-sample-role",
    importedAt
  );

  assert.equal(details.name, "Sample Role");
  assert.equal(details.title, "Sample Role");
  assert.equal(details.description, "<h1>Role</h1>");
  assert.equal(details.html, "<h1>Role</h1>");
  assert.equal(details.content, "Role");
  assert.deepEqual(details.benefit_tags, ["free-accommodation"]);
  assert.equal(details.show_on_ismira_web, true);
  assert.equal(details.source_url, "https://example.test/p/abc123-sample-role");
  assert.equal(details.imported_from_public_portal_at, importedAt);
});
