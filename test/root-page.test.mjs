import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = path.join(process.cwd(), "src/app/page.tsx");
const source = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: {
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

function loadRootPage() {
  const context = {
    exports: {},
    require(specifier) {
      if (specifier === "@/app/jobs/page") {
        return {
          __esModule: true,
          default: () => "jobs-page",
          metadata: { title: "Ismira Jobs Portal" },
        };
      }
      if (specifier === "next/navigation") {
        return {
          redirect(destination) {
            throw new Error(`redirected to ${destination}`);
          },
        };
      }
      return require(specifier);
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.exports;
}

test("root page renders the jobs page instead of redirecting to it", () => {
  const rootPage = loadRootPage();
  assert.equal(rootPage.default(), "jobs-page");
});
