import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
function fixture({ authenticated = true, rowCount = 70, selectedIndices = [55, 65] } = {}) {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    company_id: 'tenant', breezy_company_id: 'group', breezy_position_id: `jd-${index}`,
    name: `Job ${String(index).padStart(2, '0')}`, org_type: 'position', state: 'published',
    company: index === 65 ? 'Other' : 'Cruise', department: 'Restaurant',
    override_priority: JSON.stringify(index === 65 ? 'active-hiring' : 'priority-opening'),
    override_show_on_ismira_web: selectedIndices.includes(index),
  }));
  const admin = { from(table) {
    let range = null;
    let edited = false;
    const filters = [];
    const query = {
      select() { return query; }, order() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      range(start, end) { range = [start, end]; return query; },
      not() { edited = true; return query; }, neq() { return query; },
      then(resolve, reject) {
        let data = table === 'breezy_positions' && !edited ? rows.filter(row => filters.every(filter => filter(row))) : [];
        const count = data.length;
        if (range) data = data.slice(range[0], Math.min(range[1] + 1, range[0] + 1000));
        else data = data.slice(0, 1000);
        return Promise.resolve({ data, count, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const overrides = {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => admin },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null }, error: null }) } }) },
    '@/lib/company/primary': { getPrimaryCompanyId: async () => 'tenant' },
    '@/lib/company/membership': {}, '@/lib/jobs-api-cache': {}, '@/lib/breezy': {},
    '@/lib/job-companies': {
      normalizeJobCompanyName: name => (name ?? '').toLowerCase().trim(),
      resolveKnownJobCompanyName: () => '',
      resolveActiveJobCompanies: async (_admin, _companyId, companies) => companies,
    },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, Response, Request, URL, console, require(name) {
      if (overrides[name]) return overrides[name];
      const source = name.startsWith('@/') ? `src/${name.slice(2)}.ts` : `src/lib/${name.replace('./', '')}.ts`;
      return load(source);
    } });
    return exports;
  }
  return load('src/app/api/breezy/positions-cache/route.ts').GET;
}
const request = query => new Request(`https://app.test/api/breezy/positions-cache?companyId=group&${query}`);

test('external filter finds selected jobs beyond the first page and paginates matching rows', async () => {
  const GET = fixture();
  const first = await GET(request('external=ismira-web&limit=1'));
  assert.equal(first.status, 200);
  const data = await first.json();
  assert.deepEqual(data.positions.map(row => row.id), ['jd-55']);
  assert.equal(data.total, 2);
  assert.equal(data.nextOffset, 1);
  const second = await (await GET(request('external=ismira-web&limit=1&offset=1'))).json();
  assert.deepEqual(second.positions.map(row => row.id), ['jd-65']);
  assert.equal(second.nextOffset, null);
});

test('not external excludes selected jobs and clearing the filter returns all rows', async () => {
  const GET = fixture();
  const data = await (await GET(request('external=none&limit=100'))).json();
  assert.equal(data.total, 68);
  assert.equal(data.positions.some(row => row.show_on_ismira_web), false);
  const all = await (await GET(request('limit=100'))).json();
  assert.equal(all.total, 70);
  assert.equal(all.positions.length, 70);
});

test('external filter combines with company, opening type and search', async () => {
  const GET = fixture();
  const data = await (await GET(request('external=ismira-web&jobCompany=Cruise&priority=priority-opening&search=55'))).json();
  assert.deepEqual(data.positions.map(row => row.id), ['jd-55']);
  assert.equal(data.total, 1);
  const empty = await (await GET(request('external=none&search=55'))).json();
  assert.equal(empty.total, 0);
  assert.equal(empty.warning, undefined);
});

test('invalid external options are rejected and the filter still requires authentication', async () => {
  assert.equal((await fixture()(request('external=unknown'))).status, 400);
  assert.equal((await fixture({ authenticated: false })(request('external=ismira-web'))).status, 401);
});

test('external filters and totals include matching jobs beyond the database response row cap', async () => {
  const GET = fixture({ rowCount: 1200, selectedIndices: [1055, 1065] });
  const selected = await (await GET(request('external=ismira-web&limit=100'))).json();
  assert.deepEqual(selected.positions.map(row => row.id), ['jd-1055', 'jd-1065']);
  assert.equal(selected.total, 2);
  const others = await (await GET(request('external=none&offset=1100&limit=100'))).json();
  assert.equal(others.total, 1198);
  assert.equal(others.positions.length, 98);
  assert.equal(others.nextOffset, null);
});
