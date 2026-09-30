import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
const ts = createRequire(import.meta.url)("typescript");
function load(file, overrides = {}) {
  const context = { exports: {}, Response, Headers, FormData, process: {env:{BREEZY_API_TOKEN:'legacy-token'}}, fetch: () => {throw new Error('External network attempted');}, require: () => ({}), ...overrides };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, context);
  return context.exports;
}
test('legacy adapter never authenticates or sends any network request', async () => {
  const adapter = load('src/lib/breezy.ts');
  for (const path of ['/company/example/positions', 'https://api.breezy.hr/v3/signin', 'https://example.com']) {
    const res = await adapter.breezyFetch(path, {method:'POST',body:'{}'});
    assert.equal(res.status, 410);
    assert.equal((await res.json()).code, 'BREEZY_INTEGRATION_RETIRED');
  }
});

function database(tables = {}, authenticated = true) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null }, error: null }) },
    from(table) {
      const query = { then: (resolve) => Promise.resolve(tables[table] ?? { data: [], error: null }).then(resolve) };
      for (const method of ['select','eq','like','ilike','contains','order','limit','in','maybeSingle','upsert']) query[method] = (...args) => { calls.push({ table, method, args }); return query; };
      return query;
    }
  };
  return {client, calls};
}
function loadRoute(file, db) {
  return load(file, { URL, Request, require(name) {
    if (name === 'next/server') return { NextResponse: Response };
    if (name === '@/lib/supabase/server') return { createSupabaseServerClient: async () => db.client };
    if (name === '@/lib/supabase/admin') return { createSupabaseAdminClient: () => db.client };
    if (name === '@/lib/company/membership') return { ensureCompanyMembership: async () => ({ companyId: 'tenant-1' }) };
    if (name === '@/lib/breezy') return load('src/lib/breezy.ts');
    throw new Error(`Unexpected dependency ${name}`);
  }});
}

test('obsolete sync, send, and remote document endpoints return 410 without accessing data', async () => {
  for (const [route, method] of [['send','POST'],['candidate-full-sync','POST'],['candidate-documents-sync','POST'],['candidates-import','POST'],['candidate-document','GET'],['candidates-with-attachments','GET'],['webhook-endpoints','GET'],['custom-attributes/candidate','GET']]) {
    const handlers = loadRoute(`src/app/api/breezy/${route}/route.ts`, {});
    const response = await handlers[method]();
    assert.equal(response.status, 410, route);
    assert.equal((await response.json()).code, 'BREEZY_INTEGRATION_RETIRED');
  }
});

test('empty template cache stays empty without attempting remote fallback', async () => {
  const db = database();
  const route = loadRoute('src/app/api/breezy/templates-cache/route.ts', db);
  const response = await route.GET(new Request('https://local.test/api?companyId=legacy'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {folders:[], templates:[]});
  assert.ok(db.calls.some(c => c.method === 'eq' && c.args[0] === 'company_id' && c.args[1] === 'tenant-1'));
  assert.equal((await route.POST()).status, 410);
});

test('template detail uses stored columns over stale raw content and preserves folder editing', async () => {
  const db = database({breezy_templates:{data:{raw:{body:'old'},body:'edited',name:'Stored',subject:'Subject',folder_id:'folder'},error:null},breezy_template_folders:{data:{id:'folder'},error:null}});
  const route = loadRoute('src/app/api/breezy/templates-cache/[templateId]/route.ts', db);
  const response = await route.GET(new Request('https://local.test/api?companyId=legacy'), {params:Promise.resolve({templateId:'template'})});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.template.body,'edited');
  assert.equal(body.folder_id,'folder');
  const patched = await route.PATCH(new Request('https://local.test/api?companyId=legacy',{method:'PATCH',body:JSON.stringify({folderId:'folder'})}), {params:Promise.resolve({templateId:'template'})});
  assert.equal(patched.status,200);
  assert.ok(db.calls.some(c => c.table === 'breezy_templates' && c.method === 'upsert'));
});

test('missing stored template returns 404 and cannot recreate data remotely', async () => {
  const db = database({breezy_templates:{data:null,error:null}});
  const route = loadRoute('src/app/api/breezy/templates-cache/[templateId]/route.ts', db);
  const response = await route.GET(new Request('https://local.test/api?companyId=legacy'),{params:Promise.resolve({templateId:'missing'})});
  assert.equal(response.status,404);
  assert.ok(!db.calls.some(c => c.method === 'upsert'));
});

test('imported email search queries only visible stored candidates and escapes wildcard characters', async () => {
  const db = database({candidates:{data:[{id:'breezy_1', data:{name:'Example',email:'a_b@example.test'}}],error:null},candidate_attachments:{data:[{candidate_id:'breezy_1'}],error:null}});
  const route = loadRoute('src/app/api/breezy/imported-candidates/route.ts', db);
  const response = await route.GET(new Request('https://local.test/api?companyId=legacy&positionId=opening&q=a_b%40example.test'));
  assert.equal(response.status,200);
  const body = await response.json();
  assert.equal(body.candidates[0].attachmentCount,1);
  assert.equal(body.meta.source,'supabase');
  assert.ok(db.calls.some(c => c.method === 'ilike' && c.args[1] === 'a\\_b@example.test'));
  const anonymous = loadRoute('src/app/api/breezy/imported-candidates/route.ts',database({},false));
  assert.equal((await anonymous.GET(new Request('https://local.test/api?companyId=legacy&positionId=opening'))).status,401);
});

test('candidate drawer refresh never initiates retired sync and retains stored attachment loading', () => {
  const source = fs.readFileSync('src/app/pipeline/components/CandidateDrawer.tsx','utf8');
  assert.doesNotMatch(source, /\/api\/breezy\/(candidate-full-sync|candidate-documents-sync)/);
  assert.match(source, /\.from\("candidate_attachments"\)/);
  assert.match(source, /setRefreshCounter\(\(prev\) => prev \+ 1\)/);
  assert.match(source, /Some imported document references have no stored file/);
});

test('pipeline and questionnaire catalogs remain readable from authenticated Supabase data', async () => {
  for (const table of ['pipelines','questionnaires']) {
    const db = database({[table]:{data:[{id:'stored',name:'Stored record'}],error:null}});
    const route = loadRoute(`src/app/api/breezy/${table}/route.ts`,db);
    const response = await route.GET();
    assert.equal(response.status,200);
    assert.equal((await response.json())[table][0].id,'stored');
    assert.ok(db.calls.some(c => c.table === table));
  }
});

test('explicit legacy screen refresh controls invalidate cached data', () => {
  const candidates = fs.readFileSync('src/app/breezy/candidates/page.tsx','utf8');
  assert.match(candidates, /onClick=\{\(\) => \{ clear\(\); setEmail\(""\); void load\(\); \}\}/);
  const templates = fs.readFileSync('src/app/breezy/email-templates/page.tsx','utf8');
  for (const action of ['loadCompanies()', 'loadTemplates()', 'loadTemplateDetails(selectedTemplateId)']) {
    assert.ok(templates.includes(`onClick={() => { clear(); void ${action}; }}`));
  }
  for (const catalog of ['pipelines','questionnaires']) {
    const source = fs.readFileSync(`src/app/breezy/${catalog}/page.tsx`,'utf8');
    assert.match(source, /clear\(\); setSelected\(null\); setReload\(value => value \+ 1\)/);
    assert.match(source, /\[request, reload\]/);
  }
});
