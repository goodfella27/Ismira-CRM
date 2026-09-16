import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
function load(path, imports = {}) {
  const context = { exports: {}, require: key => imports[key], Error };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
}
const priorities = load('src/lib/breezy-priority-types.ts');
function setup({ authenticated = true, writeError = null } = {}) {
  let rows = [
    { company_id: 'ours', key: 'active', label: 'Active', sort_order: 0, show_on_frontpage: true, tooltip: 'Active tooltip' },
    { company_id: 'ours', key: 'soon', label: 'Soon', sort_order: 1, show_on_frontpage: false, tooltip: '' },
    { company_id: 'other', key: 'active', label: 'Other', sort_order: 0 },
  ];
  let cleared = 0;
  let writes = 0;
  const admin = { from: () => ({
    async insert(row) {
      rows.push({ ...row });
      writes++;
      return { error: null };
    },
    select() {
      let company;
      const query = {
        eq: (field, value) => { assert.equal(field, 'company_id'); company = value; return query; },
        order: () => query,
        then: resolve => Promise.resolve({ data: rows.filter(row => row.company_id === company), error: null }).then(resolve),
      };
      return query;
    },
    async upsert(updates) {
      writes++;
      if (writeError) return { error: { message: writeError } };
      for (const update of updates) {
        const row = rows.find(row => row.company_id === update.company_id && row.key === update.key);
        Object.assign(row, update);
      }
      return { error: null };
    },
    update(updates) {
      const filters = {};
      const query = {
        eq: (field, value) => { filters[field] = value; return query; },
        then: resolve => {
          writes++;
          if ('tooltip' in updates) return Promise.resolve({ error: { message: 'Could not find the tooltip column in the schema cache' } }).then(resolve);
          for (const row of rows) {
            if (Object.entries(filters).every(([key, value]) => row[key] === value)) Object.assign(row, updates);
          }
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return query;
    },
  }) };
  const route = load('src/app/api/breezy/priority-types/route.ts', {
    'next/server': { NextResponse: { json: (body, { status }) => ({ body: JSON.parse(JSON.stringify(body)), status }) } },
    '@/lib/breezy-priority-types': priorities,
    '@/lib/company/membership': { ensureCompanyMembership: async () => ({ companyId: 'ours' }) },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => admin },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'editor' } : null }, error: null }) } }) },
    '@/lib/jobs-api-cache': { clearJobsResponseCache: () => cleared++ },
    '@/lib/job-company-opening-types': {},
  });
  return { route, rows, get cleared() { return cleared; }, get writes() { return writes; } };
}
const request = body => ({ json: async () => body });

test('new opening types are visible by default and append to the saved order', async () => {
  const state = setup();
  const result = await state.route.POST(request({ label: 'Live Interview' }));
  assert.equal(result.status, 201);
  const created = result.body.priorityTypes.at(-1);
  assert.equal(created.key, 'live-interview');
  assert.equal(created.showOnFrontpage, true);
  assert.equal(created.sortOrder, 2);
  assert.equal(state.cleared, 1);
});

test('visibility toggles independently of label and unsaved tooltip, in both directions', async () => {
  const state = setup();
  for (const showOnFrontpage of [true, false]) {
    const result = await state.route.PATCH(request({ key: 'soon', showOnFrontpage }));
    assert.equal(result.status, 200);
    const type = result.body.priorityTypes.find(type => type.key === 'soon');
    assert.equal(type.showOnFrontpage, showOnFrontpage);
    assert.equal(type.label, 'Soon');
    assert.equal(type.tooltip, '');
  }
  assert.equal(state.cleared, 2);
});

test('empty edits are rejected and missing tooltip storage reports an explicit error', async () => {
  const state = setup();
  assert.equal((await state.route.PATCH(request({ key: 'soon' }))).status, 400);
  const result = await state.route.PATCH(request({ key: 'soon', label: 'Soon', tooltip: 'Explanation' }));
  assert.equal(result.status, 500);
  assert.match(result.body.error, /Tooltip storage is not set up/);
});

test('reorder persists company order, preserves metadata and invalidates public jobs cache', async () => {
  const state = setup();
  assert.equal(typeof state.route.PUT, 'function');
  const result = await state.route.PUT(request({ orderedKeys: ['soon', 'active'] }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.priorityTypes.map(type => type.key), ['soon', 'active']);
  assert.deepEqual(result.body.priorityTypes.map(type => type.sortOrder), [0, 1]);
  assert.equal(state.rows[0].tooltip, 'Active tooltip');
  assert.equal(state.rows[0].show_on_frontpage, true);
  assert.equal(state.rows[1].tooltip, '');
  assert.equal(state.rows[1].show_on_frontpage, false);
  assert.equal(state.rows[2].sort_order, 0);
  assert.equal(state.cleared, 1);
  assert.equal(state.writes, 1);
  const reload = await state.route.GET();
  assert.deepEqual(reload.body.priorityTypes.map(type => type.key), ['soon', 'active']);
});

test('invalid or stale orders cannot write', async () => {
  for (const orderedKeys of [null, [], ['active', 'active'], ['active'], ['active', 'foreign'], [1, 'active']]) {
    const state = setup();
    const result = await state.route.PUT(request({ orderedKeys }));
    assert.ok([400, 409].includes(result.status));
    assert.equal(state.writes, 0);
    assert.equal(state.cleared, 0);
  }
});

test('authentication and save failures return errors without publishing a new order', async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ writeError: 'Save failed' }, 500]]) {
    const state = setup(options);
    const result = await state.route.PUT(request({ orderedKeys: ['soon', 'active'] }));
    assert.equal(result.status, status);
    assert.equal(state.cleared, 0);
    assert.equal(state.rows[0].sort_order, 0);
  }
});
