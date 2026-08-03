import assert from "node:assert/strict";
import test from "node:test";

import { buildSupabasePositionDetails } from "../src/lib/position-cache-details.mjs";

test("builds modal details from Supabase columns when cached details are missing", () => {
  const details = buildSupabasePositionDetails({
    row: {
      breezy_position_id: "sample-training",
      name: "SAMPLE COMPANY - TRAINING & DEVELOPMENT MANAGER",
      state: "published",
      friendly_id: "training-development-manager",
      org_type: "position",
      company: "Sample Cruise Line",
      department: "HR",
      details: null,
      overrides: {
        summary: "Lead shipboard training programs.",
        description: "<p>Own onboarding and development.</p>",
        location_name: "Shipboard",
        show_on_ismira_web: true,
      },
    },
    companies: ["Sample Cruise Line"],
  });

  assert.deepEqual(details.companies, ["Sample Cruise Line"]);
  assert.equal(details.id, "sample-training");
  assert.equal(details.name, "SAMPLE COMPANY - TRAINING & DEVELOPMENT MANAGER");
  assert.equal(details.company, "Sample Cruise Line");
  assert.equal(details.department, "HR");
  assert.equal(details.state, "published");
  assert.equal(details.location_name, "Shipboard");
  assert.equal(details.locationName, "Shipboard");
  assert.equal(details.summary, "Lead shipboard training programs.");
  assert.equal(details.description, "<p>Own onboarding and development.</p>");
  assert.equal(details.show_on_ismira_web, true);
});

test("marks the details payload when Supabase has no JD body content", () => {
  const details = buildSupabasePositionDetails({
    row: {
      breezy_position_id: "sample-position",
      name: "SAMPLE COMPANY - CREW ROLE",
      state: "published",
      company: "Sample Cruise Line",
      details: null,
      overrides: {},
    },
  });

  assert.equal(details.jd_content_missing, true);
});
