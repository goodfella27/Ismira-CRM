import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function load() {
  const source = ts.transpileModule(fs.readFileSync("src/lib/job-company-name-maps.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {} }; vm.createContext(context); vm.runInContext(source, context);
  return context.exports.buildJobCompanyNameMaps;
}
test("merged company IDs and old names resolve to the active company", () => {
  const maps = load()([
    { id: "old", name: "FSY", normalized_name: "fsy", metadata: { merged_into_job_company_id: "active" } },
    { id: "active", name: "FOUR SEASONS YACHTS", normalized_name: "four seasons yachts" },
  ]);
  assert.equal(maps.companyNameById.get("old"), "FOUR SEASONS YACHTS");
  assert.equal(maps.companyNameByNormalized.get("fsy"), "FOUR SEASONS YACHTS");
});
test("merge chains resolve and missing targets retain their own name", () => {
  const maps = load()([
    { id: "a", name: "A", normalized_name: "a", metadata: { merged_into_job_company_id: "b" } },
    { id: "b", name: "B", normalized_name: "b", metadata: { merged_into_job_company_id: "c" } },
    { id: "c", name: "C", normalized_name: "c" },
    { id: "d", name: "D", normalized_name: "d", metadata: { merged_into_job_company_id: "missing" } },
  ]);
  assert.equal(maps.companyNameById.get("a"), "C");
  assert.equal(maps.companyNameById.get("d"), "D");
});
