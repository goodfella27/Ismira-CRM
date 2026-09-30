import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url); const ts=require('typescript');
function load(file,imports={}) {const ctx={exports:{},require:name=>{if(name in imports)return imports[name];throw Error(name);}};vm.createContext(ctx);vm.runInContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);return ctx.exports;}
test('documentation and descendants require an admin and use the CRM shell',()=>{const policy=load('src/lib/auth/route-policy.ts');const shell=load('src/lib/public-shell-routes.ts');for(const path of ['/design-system','/design-system/components']){assert.equal(policy.isProtectedRoute(path),true);assert.equal(policy.isAdminOnlyRoute(path),true);assert.equal(policy.isPublicRoute(path),false);assert.equal(shell.isPublicShellRoute(path),false);}assert.equal(policy.isAdminOnlyRoute('/design-system-other'),false);});
test('documentation server page checks access before rendering examples',async()=>{for(const [access,destination] of [[null,'/admin?next=/design-system'],[{isAdmin:false},'/breezy'],[{isAdmin:true},null]]){let rendered=false;const page=load('src/app/design-system/page.tsx',{'next/navigation':{redirect:url=>{throw Error(url)}},'@/lib/auth/access':{getCurrentUserAccess:async()=>access},'./catalog':{default:()=>null},'react/jsx-runtime':{jsx:()=>{rendered=true;return 'catalog'}}});if(destination)await assert.rejects(page.default(),{message:destination});else assert.equal(await page.default(),'catalog');assert.equal(rendered,!destination);}});
