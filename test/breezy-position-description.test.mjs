import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = path.join(
  process.cwd(),
  "src/lib/breezy-position-description.ts"
);
const source = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const context = { exports: {} };
vm.createContext(context);
vm.runInContext(source, context);

test("pickPositionDescription skips empty HTML and falls back to content", () => {
  assert.equal(
    context.exports.pickPositionDescription({
      description: "<br>",
      content: "Real JD body",
    }),
    "Real JD body"
  );
});

test("pickPositionDescription keeps HTML with visible text", () => {
  assert.equal(
    context.exports.pickPositionDescription({
      description: "<p>Visible JD body</p>",
      content: "Fallback body",
    }),
    "<p>Visible JD body</p>"
  );
});

test("pickPositionDescription prefers structured html before plain content", () => {
  assert.equal(
    context.exports.pickPositionDescription({
      description: "<br>",
      content: "Plain JD body",
      html: "<h1>Structured JD body</h1><ul><li>Item</li></ul>",
    }),
    "<h1>Structured JD body</h1><ul><li>Item</li></ul>"
  );
});
