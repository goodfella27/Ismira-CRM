import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { parseArgs } from "../scripts/backfill-missing-job-descriptions.mjs";

test("parseArgs keeps limit zero as an explicit zero-row run", () => {
  const args = parseArgs([
    "--source-base-url=https://example.test",
    "--limit=0",
  ]);

  assert.equal(args.sourceBaseUrl, "https://example.test");
  assert.equal(args.limit, 0);
  assert.equal(args.apply, false);
});

test("parseArgs defaults to dry run with no limit", () => {
  const args = parseArgs(["--source-base-url=https://example.test"]);

  assert.equal(args.sourceBaseUrl, "https://example.test");
  assert.equal(args.limit, null);
  assert.equal(args.apply, false);
});

test("pathToFileURL encodes workspace paths with spaces for direct script guard", () => {
  assert.equal(
    pathToFileURL("/tmp/Local Sites/app/scripts/backfill-missing-job-descriptions.mjs").href,
    "file:///tmp/Local%20Sites/app/scripts/backfill-missing-job-descriptions.mjs"
  );
});
