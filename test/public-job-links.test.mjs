import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = path.join(process.cwd(), "src/lib/public-job-links.ts");
const source = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const context = { exports: {}, URLSearchParams, decodeURIComponent };
vm.createContext(context);
vm.runInContext(source, context);

const localJob = {
  id: "local_local_local_2ec33c21_ec83a315_d79af221",
  name: "Sommelier",
  company: "SILVERSEA",
};

test("public job share paths use clean JD slugs instead of raw local IDs", () => {
  const pathValue = context.exports.getPublicJobSharePath(localJob);
  assert.equal(pathValue, "/?jd=sommelier-silversea-ec83a315-d79af221");
  assert.equal(pathValue.includes("local_"), false);
  assert.equal(pathValue.includes("?job="), false);
});

test("public job share urls keep the supplied origin", () => {
  assert.equal(
    context.exports.getPublicJobShareUrl(localJob, "https://jobs.ismira.lt/"),
    "https://jobs.ismira.lt/?jd=sommelier-silversea-ec83a315-d79af221"
  );
});

test("public job slugs resolve back to internal ids for modal API calls", () => {
  assert.equal(
    context.exports.resolvePublicJobId(
      "sommelier-silversea-ec83a315-d79af221",
      [localJob]
    ),
    localJob.id
  );
  assert.equal(context.exports.resolvePublicJobId(localJob.id, [localJob]), localJob.id);
});
