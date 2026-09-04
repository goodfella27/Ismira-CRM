import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = path.join(process.cwd(), "src/lib/public-shell-routes.ts");
const source = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const context = { exports: {} };
vm.createContext(context);
vm.runInContext(source, context);

test("root and jobs render without the private CRM shell", () => {
  assert.equal(context.exports.isPublicShellRoute("/"), true);
  assert.equal(context.exports.isPublicShellRoute("/jobs"), true);
  assert.equal(context.exports.isPublicShellRoute("/jobs/embed"), true);
});

test("admin and auth routes render without the private CRM shell", () => {
  assert.equal(context.exports.isPublicShellRoute("/admin"), true);
  assert.equal(context.exports.isPublicShellRoute("/login"), true);
  assert.equal(context.exports.isPublicShellRoute("/register"), true);
});

test("CRM routes keep the private app shell", () => {
  assert.equal(context.exports.isPublicShellRoute("/pipeline"), false);
  assert.equal(context.exports.isPublicShellRoute("/companies"), false);
  assert.equal(context.exports.isPublicShellRoute("/company"), false);
});

test("unknown paths render not-found without the private CRM shell", () => {
  assert.equal(context.exports.isPublicShellRoute("/adsfsfsf"), true);
});
