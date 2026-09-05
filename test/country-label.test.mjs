import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = ts.transpileModule(fs.readFileSync("src/lib/country.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {} };
vm.createContext(context);
vm.runInContext(source, context);

test("country labels expand saved codes and empty names", () => {
  for (const [code, name] of [["KZ", "Kazakhstan"], ["KG", "Kyrgyzstan"], ["TM", "Turkmenistan"], ["BY", "Belarus"]]) {
    assert.equal(context.exports.getCountryLabel(code, code), name);
    assert.equal(context.exports.getCountryLabel(code, ""), name);
  }
  assert.equal(context.exports.getCountryLabel("kz", " kz "), "Kazakhstan");
});
test("country labels preserve full custom names", () => {
  assert.equal(context.exports.getCountryLabel("KZ", "Kazakhstan"), "Kazakhstan");
  assert.equal(context.exports.getCountryLabel("EU", "European Union"), "European Union");
});

test("manual countries replace stale country groups and retain added Turkey", () => {
  const groups = context.exports.buildManualCountryGroups(["LT", "TR", "tr", "invalid"]);
  assert.equal(JSON.stringify(groups.processable), JSON.stringify([
    { code: "LT", name: "Lithuania" }, { code: "TR", name: "Turkey" },
  ]));
  assert.equal(groups.blocked.length, 0);
  assert.equal(groups.mentioned.length, 0);
  assert.equal(context.exports.buildManualCountryGroups(undefined), null);
});

test("country editor includes saved countries missing from enabled options", () => {
  const options = context.exports.getCountryEditorOptions(
    [{ code: "LT", name: "Lithuania" }, { code: "TR", name: "Turkey" }],
    ["LT", "BY", "KZ", "KG", "TM", "kz"]
  );
  assert.equal(JSON.stringify(options.map(item => item.code)), JSON.stringify(["LT", "TR", "BY", "KZ", "KG", "TM"]));
  assert.equal(options.find(item => item.code === "KZ").name, "Kazakhstan");
  assert.equal(options.find(item => item.code === "BY").name, "Belarus");
});
