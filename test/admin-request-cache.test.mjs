import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
const ts = createRequire(import.meta.url)("typescript");
const context = { exports: {}, fetch, Response, DOMException };
vm.createContext(context);
vm.runInContext(ts.transpileModule(fs.readFileSync("src/lib/admin-request-cache.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const create = context.exports.createAdminRequestCache;
test("repeat reads reuse responses and mutations invalidate them", async () => {
  let calls = 0;
  const cache = create(async () => new Response(String(++calls)));
  assert.equal(await (await cache.request('/jd')).text(), '1');
  assert.equal(await (await cache.request('/jd')).text(), '1');
  await cache.request('/save', {method:'PATCH'});
  assert.equal(await (await cache.request('/jd')).text(), '3');
  cache.clear();
  assert.equal(await (await cache.request('/jd')).text(), '4');
});
test("concurrent reads share a request and return independently readable responses", async () => {
  let calls = 0;
  const cache = create(async () => new Response(String(++calls)));
  const responses = await Promise.all([cache.request('/jd'), cache.request('/jd')]);
  assert.deepEqual(await Promise.all(responses.map(r => r.text())), ['1','1']);
  assert.equal(calls, 1);
});
test("a cleared in-flight response cannot repopulate the cache", async () => {
  let release;
  let calls = 0;
  const cache = create(() => ++calls === 1 ? new Promise(resolve => {release = resolve;}) : Promise.resolve(new Response('fresh')));
  const pending = cache.request('/jd'); cache.clear(); release(new Response('old')); await pending;
  assert.equal(await (await cache.request('/jd')).text(), 'fresh');
});
test("expired entries and failed responses are fetched again", async () => {
  let calls = 0;
  const cache = create(async () => new Response(String(++calls)), -1);
  await cache.request('/jd'); await cache.request('/jd'); assert.equal(calls, 2);
  const failures = create(async () => new Response(String(++calls), {status:500}));
  await failures.request('/jd'); await failures.request('/jd'); assert.equal(calls, 4);
});
test('abortable consumers share reads without cancelling each other', async () => {
  let release; let calls=0;
  const cache=create(async()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  const controller=new AbortController();
  const first=cache.request('/list',{signal:controller.signal});
  const second=cache.request('/list');
  controller.abort();
  release(new Response('data'));
  await assert.rejects(first,{name:'AbortError'});
  assert.equal(await (await second).text(),'data');
  assert.equal(calls,1);
});
test('different request headers never reuse an existing representation', async()=>{
 let calls=0;const cache=create(async()=>new Response(String(++calls)));
 await cache.request('/list',{headers:{Authorization:'A'}});
 assert.equal(await (await cache.request('/list',{headers:{Authorization:'B'}})).text(),'2');
});
