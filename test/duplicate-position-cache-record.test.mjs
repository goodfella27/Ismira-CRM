import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDuplicatePositionInsert,
  buildDuplicatePositionListItem,
} from "../src/lib/duplicate-position-cache-record.mjs";

test("builds duplicate position data with copied fields and a different id", () => {
  const row = {
    breezy_position_id: "original-jd",
    name: "Deck Cadet",
    state: "published",
    friendly_id: "deck-cadet",
    org_type: "position",
    company: "Astoria Grande",
    department: "Deck",
    details: {
      id: "original-jd",
      name: "Deck Cadet",
      description: "<p>Original JD body</p>",
    },
    overrides: {
      summary: "Original summary",
      priority: "urgent_opening",
      benefit_tags: ["flight"],
    },
    synced_at: "2026-08-18T09:00:00.000Z",
    details_synced_at: "2026-08-18T09:05:00.000Z",
  };

  const insert = buildDuplicatePositionInsert({
    row,
    companyId: "tenant-company",
    breezyCompanyId: "breezy-company",
    duplicateId: "local_original-jd_ab12cd34",
  });
  const position = buildDuplicatePositionListItem(insert);

  assert.equal(insert.breezy_position_id, "local_original-jd_ab12cd34");
  assert.notEqual(insert.breezy_position_id, row.breezy_position_id);
  assert.equal(insert.company_id, "tenant-company");
  assert.equal(insert.breezy_company_id, "breezy-company");
  assert.equal(insert.details, row.details);
  assert.deepEqual(insert.overrides, {
    summary: "Original summary",
    priority: "urgent_opening",
    benefit_tags: ["flight"],
    name: "Deck Cadet (Copy)",
    hidden: true,
  });

  assert.deepEqual(position, {
    id: "local_original-jd_ab12cd34",
    name: "Deck Cadet (Copy)",
    state: "published",
    friendly_id: "deck-cadet",
    org_type: "position",
    company: "Astoria Grande",
    department: "Deck",
    priority: "urgent_opening",
    edited: true,
    hidden: true,
    synced_at: "2026-08-18T09:00:00.000Z",
    details_synced_at: "2026-08-18T09:05:00.000Z",
  });
});
