import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = path.join(process.cwd(), "src/lib/share-metadata.ts");
const source = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const context = { exports: {} };
vm.createContext(context);
vm.runInContext(source, context);

test("public share metadata presents the jobs portal brand", () => {
  assert.equal(context.exports.JOBS_PORTAL_SHARE_TITLE, "Ismira Jobs Portal");
  assert.equal(
    context.exports.JOBS_PORTAL_SHARE_DESCRIPTION,
    "Discover cruise, hospitality, and international career opportunities with Ismira."
  );
  assert.equal(context.exports.JOBS_PORTAL_SHARE_PATH, "/");
});

test("public share metadata avoids internal CRM wording", () => {
  const combined = [
    context.exports.JOBS_PORTAL_SHARE_TITLE,
    context.exports.JOBS_PORTAL_SHARE_DESCRIPTION,
  ].join(" ");

  assert.equal(/linas|talent operations crm|admin workspace/i.test(combined), false);
});

test("open graph image metadata uses a square youthful preview image", () => {
  const image = context.exports.JOBS_PORTAL_SHARE_IMAGE;
  assert.equal(image.url, "/opengraph-image");
  assert.equal(image.width, 1200);
  assert.equal(image.height, 1200);
  assert.equal(image.alt, "Ismira Jobs Portal gradient logo");
});
