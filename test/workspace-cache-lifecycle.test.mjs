import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import test from 'node:test';
const ts=createRequire(import.meta.url)('typescript');
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
test('workspace cache clears on auth changes and focus, and unsubscribes on teardown',async()=>{
 let count=0;const cacheCtx={exports:{},fetch:async()=>new Response(String(++count)),Response,DOMException};vm.createContext(cacheCtx);vm.runInContext(transpile('src/lib/admin-request-cache.ts'),cacheCtx);
 let cache,effect,authCallback,unsubscribed=false;const listeners=new Map();
 const events={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
 const ctx={exports:{},window:events,document:{...events,visibilityState:'visible'},require:name=>({
 'react':{createContext:()=>({Provider:'provider'}),useState:init=>[init()],useEffect:fn=>{effect=fn;}},
 'react/jsx-runtime':{jsx:()=>null},
 '@/lib/admin-request-cache':{createAdminRequestCache:()=>{cache=cacheCtx.exports.createAdminRequestCache();return cache;}},
 '@/lib/supabase/client':{createSupabaseBrowserClient:()=>({auth:{onAuthStateChange:fn=>{authCallback=fn;return{data:{subscription:{unsubscribe:()=>{unsubscribed=true;}}}};}}})}
 })[name]};vm.createContext(ctx);vm.runInContext(transpile('src/components/workspace-data-provider.tsx'),ctx);
 ctx.exports.WorkspaceDataProvider({children:null,isAdmin:true});const cleanup=effect();
 await cache.request('/list');await cache.request('/list');assert.equal(count,1);
 authCallback('SIGNED_OUT');await cache.request('/list');assert.equal(count,2);
 listeners.get('focus')();await cache.request('/list');assert.equal(count,3);
 cleanup();assert.equal(unsubscribed,true);assert.equal(listeners.size,0);
});
