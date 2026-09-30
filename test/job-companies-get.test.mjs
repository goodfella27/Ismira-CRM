import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const company = (id, metadata = {}) => ({ id, company_id: 'tenant', name: id, normalized_name: id, slug: id, logo_path: null, website: null, metadata });
function fixture(extra = {}) {
  const tables = {
    job_companies: [company('auto', { job_company_country_codes: ['LT'] }), company('manual', { job_company_benefits_manual_override: true }), company('stored')],
    job_company_benefits: [{ job_company_id: 'stored', tag: 'custom', enabled: true }],
    breezy_positions: [{ breezy_position_id: 'p1', job_company_id: 'auto', state: 'published', org_type: 'position', details: { description: 'Free accommodation and meals', processable_country_codes: ['LV'] } }],
    job_position_companies: [], breezy_position_countries: [], job_company_merge_logs: [], job_benefit_options: [], job_country_options: [], ...extra,
  };
  const events = [];
  const admin = { from(table) {
    const filters = [];
    const query = {
      select() { return query; }, order() { return query; }, limit() { return query; }, is() { return query; },
      eq(key, value) { filters.push(row => row[key] === value || row[key] === undefined); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      delete() { events.push(`write:${table}`); return query; },
      insert() { events.push(`write:${table}`); return query; },
      then(resolve, reject) {
        events.push(`start:${table}`);
        return new Promise(done => setImmediate(() => {
          events.push(`end:${table}`);
          done({ data: (tables[table] ?? []).filter(row => filters.every(filter => filter(row))), error: null });
        })).then(resolve, reject);
      },
    };
    return query;
  }, storage: { from() { return { createSignedUrl: async () => ({ data: { signedUrl: 'https://logo.test/logo' } }) }; } } };
  const overrides = {
    'next/server': { NextResponse: { json: (body, init) => ({ body: JSON.parse(JSON.stringify(body)), status: init.status }) } },
    '@/lib/company/membership': { ensureCompanyMembership: async () => ({ companyId: 'tenant' }) },
    '@/lib/jobs-api-cache': { clearJobsResponseCache() {} },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => admin },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) },
  };
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, URL, console, require: name => overrides[name] ?? (name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`) : require(name)),
    });
    return exports;
  }
  return { GET: load('src/app/api/company/job-companies/route.ts').GET, events };
}
test('full company read derives missing benefits without writes or a second position scan', async () => {
  const { GET, events } = fixture();
  const result = await GET(new Request('https://app.test/api/company/job-companies'));
  assert.equal(result.status, 200);
  assert.deepEqual(events.filter(event => event.startsWith('write:')), []);
  assert.equal(events.filter(event => event === 'start:breezy_positions').length, 1);
  const auto = result.body.companies.find(row => row.id === 'auto');
  assert.deepEqual(auto.benefitTags, ['accommodation', 'meals']);
  assert.deepEqual(auto.countryCodes, ['LT', 'LV']);
  assert.equal(auto.positionsCount, 1);
  assert.deepEqual(result.body.companies.find(row => row.id === 'manual').benefitTags, []);
  assert.deepEqual(result.body.companies.find(row => row.id === 'stored').benefitTags, ['custom']);
});
test('full read starts independent enrichment reads before positions finish', async () => {
  const { GET, events } = fixture();
  await GET(new Request('https://app.test/api/company/job-companies'));
  const endPositions = events.indexOf('end:breezy_positions');
  for (const table of ['job_position_companies', 'breezy_position_countries', 'job_company_merge_logs', 'job_benefit_options', 'job_country_options']) {
    assert.ok(events.indexOf(`start:${table}`) < endPositions, `${table} was serialized after positions`);
  }
});
test('lookup returns stored company suggestions without loading positions or admin options', async () => {
  const { GET, events } = fixture();
  const result = await GET(new Request('https://app.test/api/company/job-companies?view=lookup'));
  assert.equal(result.status, 200);
  assert.deepEqual(events.filter(event => event.startsWith('start:')).sort(), ['start:job_companies', 'start:job_company_benefits']);
  assert.equal(result.body.companies.length, 3);
  assert.deepEqual(result.body.companies.find(row => row.id === 'stored').benefitTags, ['custom']);
  assert.equal('positionsCount' in result.body.companies[0], false);
});
test('automatic benefits use only six newest published non-pool descriptions', async () => {
  const position = (id, details, extra = {}) => ({ breezy_position_id: id, job_company_id: 'auto', state: 'published', org_type: 'position', details: { description: details }, ...extra });
  const { GET } = fixture({ breezy_positions: [
    position('old', 'Free accommodation', { details_synced_at: '2020-01-01' }),
    position('draft', 'Visa support', { state: 'draft', details_synced_at: '2030-01-01' }),
    position('pool', 'Medical exam', { org_type: 'pool', details_synced_at: '2030-01-01' }),
    ...Array.from({ length: 6 }, (_, index) => position(`new-${index}`, 'Free meals', { details_synced_at: `2026-01-0${index + 1}` })),
    position('manual', 'Free meals', { job_company_id: 'manual' }),
    position('stored', 'Free meals', { job_company_id: 'stored' }),
  ] });
  const result = await GET(new Request('https://app.test/api/company/job-companies'));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.companies.find(row => row.id === 'auto').benefitTags, ['meals']);
  assert.deepEqual(result.body.companies.find(row => row.id === 'manual').benefitTags, []);
  assert.deepEqual(result.body.companies.find(row => row.id === 'stored').benefitTags, ['custom']);
});
test('duplicate display groups retain merged benefits, countries and unique linked position counts', async () => {
  const { GET } = fixture({
    job_companies: [{ ...company('a', { job_company_country_codes: ['LT'] }), name: 'Example', normalized_name: 'example' }, { ...company('b'), name: 'Example', normalized_name: 'example' }],
    job_company_benefits: [{ job_company_id: 'a', tag: 'meals', enabled: true }, { job_company_id: 'b', tag: 'custom', enabled: true }],
    breezy_positions: [{ breezy_position_id: 'p1', job_company_id: 'a', state: 'published', org_type: 'position', details: { nationality_countries: { processable: [{ code: 'LV' }] } } }],
    job_position_companies: [{ breezy_position_id: 'p1', job_company_id: 'a' }, { breezy_position_id: 'p1', job_company_id: 'b' }],
    breezy_position_countries: [{ breezy_position_id: 'p1', country_code: 'EE', group: 'processable' }],
  });
  const result = await GET(new Request('https://app.test/api/company/job-companies'));
  assert.equal(result.status, 200);
  assert.equal(result.body.companies.length, 1);
  assert.equal(result.body.companies[0].positionsCount, 1);
  assert.deepEqual(result.body.companies[0].benefitTags, ['meals', 'custom']);
  assert.deepEqual(result.body.companies[0].countryCodes, ['LT', 'LV', 'EE']);
});
