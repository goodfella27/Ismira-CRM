import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(file, mocks = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL, URLSearchParams, Intl, console, require: key => mocks[key] ?? (key.startsWith('@/') ? load(`src/${key.slice(2)}.ts`, mocks, cache) : key.startsWith('.') ? load(path.resolve(path.dirname(file), `${key}.ts`), mocks, cache) : require(key)),
  });
  return exports;
}
const key = 'job_company_show_all_on_ismira_web';
test('company visibility is independent of individual selections, including future JDs', () => {
  const { resolveWebsiteVisibility } = load('src/lib/job-company-website-visibility.ts');
  const individual = { show_on_ismira_web: true, priority: 'urgent-joining' };
  for (const enabled of [false, true, false]) {
    assert.equal(resolveWebsiteVisibility(individual.show_on_ismira_web, { [key]: enabled }), true);
    assert.equal(resolveWebsiteVisibility(false, { [key]: enabled }), enabled);
    assert.equal(resolveWebsiteVisibility(undefined, { [key]: enabled }), enabled);
  }
  assert.deepEqual(individual, { show_on_ismira_web: true, priority: 'urgent-joining' });
  assert.equal(resolveWebsiteVisibility(false, { [key]: 'true' }), false);
});
function fixture({ user = true, fail = false } = {}) {
  const rows = [
    { id: 'one', company_id: 'tenant', name: 'ASTORIA', normalized_name: 'astoria', metadata: { ship_type: 'ocean', [key]: false } },
    { id: 'two', company_id: 'tenant', name: 'Astoria', normalized_name: 'astoria', metadata: { job_company_opening_type: 'on-hold' } },
    { id: 'foreign', company_id: 'other', name: 'Astoria', normalized_name: 'astoria', metadata: {} },
  ];
  const writes = [];
  let cleared = 0;
  const admin = { from(table) {
    assert.equal(table, 'job_companies', 'must not write individual JDs');
    const filters = []; let update;
    const query = {
      select() { return query; },
      eq(k, v) { filters.push(row => row[k] === v); return query; },
      update(value) { update = value; return query; },
      maybeSingle() { return query.then(result => ({ ...result, data: result.data[0] ?? null })); },
      then(resolve, reject) {
        const matches = rows.filter(row => filters.every(filter => filter(row)));
        if (update && !fail) for (const row of matches) { writes.push(row.id); Object.assign(row, update); }
        return Promise.resolve({ data: matches, error: update && fail ? { message: 'Save failed' } : null }).then(resolve, reject);
      },
    }; return query;
  } };
  const POST = load('src/app/api/company/job-companies/[jobCompanyId]/website-visibility/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/company/membership': { ensureCompanyMembership: async () => ({ companyId: 'tenant' }) },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => admin },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: 'user' } : null } }) } }) },
    '@/lib/jobs-api-cache': { clearJobsResponseCache: () => cleared++ },
  }).POST;
  return { rows, writes, get cleared() { return cleared; }, call: (enabled, id = 'one') => POST(new Request('https://app.test', { method: 'POST', body: JSON.stringify({ showAllOnIsmiraWeb: enabled }) }), { params: Promise.resolve({ jobCompanyId: id }) }) };
}
test('company toggle saves grouped rows, preserves metadata, and never changes JD overrides', async () => {
  const f = fixture();
  for (const enabled of [true, false]) {
    assert.equal((await f.call(enabled)).status, 200);
    assert.equal(f.rows[0].metadata[key], enabled);
    assert.equal(f.rows[1].metadata[key], enabled);
    assert.equal(f.rows[0].metadata.ship_type, 'ocean');
    assert.equal(f.rows[1].metadata.job_company_opening_type, 'on-hold');
    assert.equal(f.rows[2].metadata[key], undefined);
  }
  assert.equal(f.cleared, 2);
});
test('invalid, unauthorized and cross-tenant requests do not write', async () => {
  const f = fixture();
  assert.equal((await f.call('true')).status, 400);
  assert.equal((await f.call(true, 'foreign')).status, 404);
  assert.deepEqual(f.writes, []);
  const anonymous = fixture({ user: false });
  assert.equal((await anonymous.call(true)).status, 401);
  assert.deepEqual(anonymous.writes, []);
});
test('storage errors are reported instead of claiming success', async () => {
  assert.equal((await fixture({ fail: true }).call(true)).status, 500);
});
function publicFixture() {
  const company = { id: 'astoria', company_id: 'tenant', name: 'Astoria', normalized_name: 'astoria', metadata: { [key]: true, job_company_opening_type: 'on-hold' } };
  const makeJob = (id, overrides = {}) => ({ breezy_position_id: id, company_id: 'tenant', name: id, state: 'published', org_type: 'position', company: 'Astoria', job_company_id: 'astoria', details: { name: id, description: 'Job description', org_type: 'position' }, overrides });
  const jobs = [makeJob('manual', { show_on_ismira_web: true, priority: 'urgent-joining' }), makeJob('company', { priority: 'ongoing-interview', hidden: true }), makeJob('inherited')];
  const tables = { job_companies: [company], breezy_positions: jobs };
  const admin = { from(table) {
    const filters = [];
    const q = { select() { return q; }, order() { return q; }, or() { return q; },
      eq(k, v) { filters.push(r => r[k] === v); return q; }, in(k, v) { filters.push(r => v.includes(r[k])); return q; },
      maybeSingle() { return q.then(r => ({ ...r, data: r.data[0] ?? null })); },
      then(resolve, reject) { return Promise.resolve({ data: (tables[table] ?? []).filter(r => filters.every(f => f(r))), error: null }).then(resolve, reject); },
    }; return q;
  } };
  const mocks = {
    'next/server': { NextResponse: Response },
    '@/lib/breezy': { getBreezyEnv: () => ({}) },
    '@/lib/company/primary': { getPrimaryCompanyId: async () => 'tenant' },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => admin },
    '@/lib/http/public-api': { applyPublicCacheControl() {} },
    '@/lib/jobs-api-cache': { setJobsResponseCache() {} },
    '@/lib/job-departments': { applyDepartmentOverridesToJobs: async (_a, _c, jobs) => jobs },
    '@/lib/country': { buildManualCountryGroups: () => null },
    '@/lib/job-country-options': { fetchJobCountryOptions: async () => [] },
    '@/lib/job-benefit-options': { fetchJobBenefitOptions: async () => [], benefitLabelMap: () => ({}) },
    '@/lib/job-company-benefits': { fetchJobCompanyBenefits: async () => [], mapBenefitTagsByJobCompanyId: () => new Map(), normalizeBenefitTags: v => v ?? [], hasManualBenefitsOverride: () => true },
    '@/lib/job-companies': {
      normalizeJobCompanyName: v => (v ?? '').toLowerCase(),
      fetchJobCompaniesByNormalizedName: async () => [company], resolveActiveJobCompanies: async (_a, _c, rows) => rows,
      signJobCompanyLogoUrls: async () => new Map(),
    },
  };
  const GET = load('src/app/api/jobs/route.ts', mocks).GET;
  const detail = load('src/app/api/jobs/[positionId]/route.ts', mocks).GET;
  const build = load('src/lib/public-frontpage-jobs.ts').buildPublicFrontpageJobsPayload;
  return { company, jobs, makeJob, tables,
    async feed() { const r = await GET(new Request('https://app.test/api/jobs')); assert.equal(r.status, 200, await r.clone().text()); return build(await r.json(), 'https://app.test'); },
    async detail(id) { const r = await detail(new Request('https://app.test/api/jobs/' + id), { params: Promise.resolve({ positionId: id }) }); assert.equal(r.status, 200, await r.clone().text()); return r.json(); },
  };
}
test('public feed includes current and future company JDs with individual opening sections; off retains manual selections', async () => {
  const f = publicFixture();
  let feed = await f.feed();
  assert.deepEqual([...feed.jobs.map(j => j.id)].sort(), ['company', 'inherited', 'manual']);
  assert.equal(feed.sections.find(s => s.key === 'urgent-joining').jobs[0].id, 'manual');
  assert.equal(feed.sections.find(s => s.key === 'ongoing-interview').jobs[0].id, 'company');
  f.jobs.push(f.makeJob('future'));
  f.jobs.push({ ...f.makeJob('draft'), state: 'draft' });
  f.jobs.push({ ...f.makeJob('pool'), org_type: 'pool' });
  feed = await f.feed();
  assert.deepEqual([...feed.jobs.map(j => j.id)].sort(), ['company', 'future', 'inherited', 'manual']);
  f.company.metadata[key] = false;
  feed = await f.feed();
  assert.deepEqual([...feed.jobs.map(j => j.id)], ['manual']);
  assert.equal(f.jobs[0].overrides.show_on_ismira_web, true);
  assert.equal(f.jobs[1].overrides.show_on_ismira_web, undefined);
});
test('company-selected JD detail is active while company toggle is on', async () => {
  const f = publicFixture();
  assert.notEqual((await f.detail('company')).not_active, true);
  f.company.metadata[key] = false;
  assert.equal((await f.detail('company')).not_active, true);
});

test('a JD included through a secondary company has an active detail page', async () => {
  const f = publicFixture();
  f.company.metadata[key] = false;
  f.tables.job_companies.push({ ...f.company, id: 'secondary', name: 'Secondary', normalized_name: 'secondary', metadata: { [key]: true } });
  f.tables.job_position_companies = [
    { company_id: 'tenant', breezy_position_id: 'company', job_company_id: 'astoria', is_primary: true },
    { company_id: 'tenant', breezy_position_id: 'company', job_company_id: 'secondary', is_primary: false },
  ];
  assert.ok((await f.feed()).jobs.some(j => j.id === 'company'));
  assert.notEqual((await f.detail('company')).not_active, true);
  f.tables.job_companies[1].metadata[key] = false;
  assert.equal((await f.detail('company')).not_active, true);
});
