import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
const ts=createRequire(import.meta.url)('typescript');
const ctx={exports:{},require:n=>n==='react'?{cache:fn=>fn}: {}};vm.createContext(ctx);vm.runInContext(ts.transpileModule(fs.readFileSync('src/lib/auth/access.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,ctx);
test('membership and portal access start concurrently without changing expiry rules',async()=>{
 const started=[];const releases={};const admin={from:table=>{const q={select:()=>q,eq:()=>q,maybeSingle:()=>q,then:resolve=>{started.push(table);return new Promise(done=>{releases[table]=data=>{resolve({data,error:null});done();};});}};return q;}};
 const result=ctx.exports.resolveUserAccess(admin,'user');
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(started.sort(),['company_members','job_portal_access']);
 releases.company_members([{role:'recruiter'}]);releases.job_portal_access({access_level:'member_premium',status:'active',access_until:'2000-01-01'});
 const access=await result;assert.equal(access.canAccessHrPortal,false);assert.equal(access.isAdmin,false);
});
