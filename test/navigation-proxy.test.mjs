import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import test from 'node:test';
const ts=createRequire(import.meta.url)('typescript');
function load(file,imports={},globals={}) {const c={exports:{},require:n=>imports[n],...globals};vm.createContext(c);vm.runInContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);return c.exports;}
const policy=load('src/lib/auth/route-policy.ts');
function setup(user=null,role='admin') {let calls=0;const response=()=>({cookies:{getAll:()=>[],set(){}},kind:'next'});const {proxy}=load('src/proxy.ts',{'@/lib/auth/route-policy':policy,'next/server':{NextResponse:{next:response,redirect:url=>({...response(),kind:'redirect',url:String(url)})}},'@supabase/ssr':{createServerClient:()=>{calls++;return{auth:{getUser:async()=>({data:{user}})},from:()=>({select:()=>({eq:async()=>({data:[{role}]})})})}}}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test'}},URL});return {proxy,calls:()=>calls};}
const request=path=>({url:'https://crm.example'+path,nextUrl:new URL('https://crm.example'+path),cookies:{getAll:()=>[]}});
test('public content and icons do not wait for authentication queries',async()=>{const s=setup();for(const path of ['/apply','/jobs','/icon','/form/example']) assert.equal((await s.proxy(request(path))).kind,'next');assert.equal(s.calls(),0);});
test('protected routes and auth entry keep authorization checks',async()=>{const guest=setup();assert.match((await guest.proxy(request('/breezy/positions'))).url,/\/admin\?next=/);assert.equal(guest.calls(),1);const member=setup({id:'member'},'recruiter');assert.match((await member.proxy(request('/company'))).url,/\/pipeline$/);const admin=setup({id:'admin'});assert.equal((await admin.proxy(request('/company'))).kind,'next');assert.match((await admin.proxy(request('/admin'))).url,/\/pipeline$/);});
