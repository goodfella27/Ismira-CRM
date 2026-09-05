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

test("public description includes separately saved responsibilities and requirements", () => {
  const html = context.exports.buildPublicPositionDescription({
    description: "<p>Work aboard our ships.</p>",
    responsibilities: "<ul><li>Prepare cocktails.</li></ul>",
    requirements: "<p>Three years of experience.</p>",
  });
  assert.match(html, /Work aboard our ships/);
  assert.match(html, /<h2>Responsibilities<\/h2>\n<ul><li>Prepare cocktails/);
  assert.match(html, /<h2>Requirements<\/h2>\n<p>Three years/);
});

test("public description supports alternate fields and formats plain text bullets safely", () => {
  const html = context.exports.buildPublicPositionDescription({
    description: "Food & accommodation",
    responsibilities: "<p>&nbsp;</p>",
    responsibilities_text: "Guest service\n• Mix drinks\n• Maintain stock",
    requirements_html: "<ul><li>Experience</li></ul>",
  });
  assert.match(html, /Food &amp; accommodation/);
  assert.match(html, /<p>Guest service<\/p>/);
  assert.match(html, /<ul><li>Mix drinks<\/li><li>Maintain stock<\/li><\/ul>/);
  assert.match(html, /<h2>Requirements<\/h2>/);
});

test("public description preserves existing complete descriptions without extra sections", () => {
  const description = "<h2>Work conditions</h2><p>Travel</p><h2>Responsibilities</h2><ul><li>Service</li></ul>";
  assert.equal(context.exports.buildPublicPositionDescription({ description }), description);
});

test("public description omits empty sections and accepts section-only records", () => {
  assert.equal(context.exports.buildPublicPositionDescription(null), "");
  assert.equal(context.exports.buildPublicPositionDescription({ responsibilities: "<br>" }), "");
  assert.equal(context.exports.buildPublicPositionDescription({ requirements: "Experience" }), "<h2>Requirements</h2>\n<p>Experience</p>");
});
