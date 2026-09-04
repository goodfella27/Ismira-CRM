import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = path.join(process.cwd(), "src/lib/auth/route-policy.ts");
const source = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const context = { exports: {} };
vm.createContext(context);
vm.runInContext(source, context);

test("root reaches the jobs front page while admin is the public auth entry", () => {
  assert.equal(context.exports.isPublicRoute("/"), true);
  assert.equal(context.exports.isAuthEntryRoute("/"), false);
  assert.equal(context.exports.isPublicRoute("/admin"), true);
  assert.equal(context.exports.isAuthEntryRoute("/admin"), true);
});

test("jobs pages, embeds, and job APIs remain public for external websites", () => {
  [
    "/jobs",
    "/jobs/embed",
    "/jobs/form",
    "/job",
    "/api/jobs",
    "/api/jobs/frontpage",
    "/api/jobs/frontpage/position-123",
    "/embed/jobs/v4/mount.js",
  ].forEach((pathname) => {
    assert.equal(context.exports.isPublicRoute(pathname), true, pathname);
  });
});

test("share preview images and app icons remain public for link scrapers", () => {
  [
    "/opengraph-image",
    "/twitter-image",
    "/icon",
    "/apple-icon",
  ].forEach((pathname) => {
    assert.equal(context.exports.isPublicRoute(pathname), true, pathname);
  });
});

test("login remains an auth entry so old links can be redirected consistently", () => {
  assert.equal(context.exports.isPublicRoute("/login"), true);
  assert.equal(context.exports.isAuthEntryRoute("/login"), true);
  assert.equal(context.exports.isAuthEntryRoute("/register"), true);
});

test("admin remains reachable for logged-in users without HR portal access", () => {
  assert.equal(context.exports.getAuthEntryRedirectDestination("/admin", false), null);
  assert.equal(context.exports.getAuthEntryRedirectDestination("/admin", true), "/pipeline");
  assert.equal(context.exports.getAuthEntryRedirectDestination("/login", false), "/jobs");
  assert.equal(context.exports.getAuthEntryRedirectDestination("/register", false), "/jobs");
});

test("unknown paths are not treated as protected CRM routes", () => {
  assert.equal(context.exports.isPublicRoute("/adsfsfsf"), false);
  assert.equal(context.exports.isProtectedRoute("/adsfsfsf"), false);
  assert.equal(context.exports.isProtectedRoute("/pipeline"), true);
  assert.equal(context.exports.isProtectedRoute("/companies"), true);
});
