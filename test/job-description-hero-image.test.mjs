import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = path.join(process.cwd(), "src/lib/job-description-hero-image.ts");
const source = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const context = { exports: {} };
vm.createContext(context);
vm.runInContext(source, context);

test("composeDescriptionWithHeroImage prepends uploaded hero image before body html", () => {
  assert.equal(
    context.exports.composeDescriptionWithHeroImage({
      heroImageUrl: "https://assets.example.com/banner.jpg",
      bodyHtml: "<p>Guest services role</p>",
    }),
    '<p><img src="https://assets.example.com/banner.jpg" alt="" /></p>\n<p>Guest services role</p>'
  );
});

test("composeDescriptionWithHeroImage removes the hero image while keeping body html", () => {
  assert.equal(
    context.exports.composeDescriptionWithHeroImage({
      heroImageUrl: "",
      bodyHtml: "<p>Guest services role</p>",
    }),
    "<p>Guest services role</p>"
  );
});
