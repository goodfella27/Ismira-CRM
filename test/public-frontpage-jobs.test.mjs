import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const context = { exports, URLSearchParams, Intl, require: key => load(path.resolve(path.dirname(file), `${key}.ts`)) };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return exports;
}
const { buildPublicFrontpageJobsPayload: build } = load('src/lib/public-frontpage-jobs.ts');
const origin = 'https://jobs.example.test';
const types = [
  { key: 'urgent-joining', label: 'PRIORITY OPENING', sortOrder: 1, showOnFrontpage: true },
  { key: 'ongoing-interview', label: 'ACTIVE HIRING', sortOrder: 0, showOnFrontpage: true },
  { key: 'on-hold', label: 'COMING SOON', sortOrder: 3, showOnFrontpage: false },
  { key: 'live-interview', label: 'LIVE INTERVIEW', sortOrder: 2, showOnFrontpage: true },
];
const job = (id, priority, extra = {}) => ({ id, name: id, priority, state: 'published', show_on_ismira_web: true, ...extra });
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

test('selected JDs group by stable opening type keys in configured order, including types hidden from portal filters', () => {
  const result = build({ priorityTypes: types, jobs: [
    job('waiter', 'urgent-joining'), job('future', 'on-hold'),
    job('active', 'ongoing-interview'), job('interview', 'live-interview'),
    job('unselected', 'urgent-joining', { show_on_ismira_web: false }),
  ] }, origin);
  assert.deepEqual(plain(result.sections?.map(section => [section.key, section.jobs.map(item => item.id)])), [
    ['ongoing-interview', ['active']], ['urgent-joining', ['waiter']],
    ['live-interview', ['interview']], ['on-hold', ['future']],
  ]);
  assert.equal(result.sections[1].jobs[0].priority_label, 'PRIORITY OPENING');
  assert.equal(result.sections[1].jobs[0].priority_style, 'orange');
  assert.equal(result.sections[2].jobs[0].priority_style, 'pink');
  assert.deepEqual(plain(result.sections.map(section => section.title)), [
    'ACTIVE HIRING', 'Hot Jobs', 'Upcoming Interviews with Cruise Employers', 'COMING SOON',
  ]);
  assert.deepEqual(plain(result.jobs.map(item => item.id)), ['active', 'waiter', 'interview', 'future']);
  assert.equal(result.interviewJobs.length, 0);
});

test('renaming a type preserves inclusion and custom website headings override defaults', () => {
  for (const label of ['URGENT OPENING', 'PRIORITY OPENING', 'Expedited Hiring']) {
    const result = build({ priorityTypes: [{ ...types[0], label, websiteTitle: 'Hot Jobs' }], jobs: [job('waiter', 'urgent-joining')] }, origin);
    assert.equal(result.sections?.[0]?.title, 'Hot Jobs');
    assert.equal(result.sections[0].jobs[0].priority_label, label);
  }
  const result = build({ priorityTypes: types, jobs: [job('waiter', 'urgent-joining'), job('interview', 'live-interview')] }, origin);
  assert.deepEqual(plain(result.sections?.map(section => section.title)), ['Hot Jobs', 'Upcoming Interviews with Cruise Employers']);
});

test('external selection excludes hidden, draft, inactive and pool JDs and omits empty sections', () => {
  const result = build({ priorityTypes: types, jobs: [
    job('hidden', 'urgent-joining', { state: 'hidden' }),
    job('draft', 'urgent-joining', { state: 'draft' }),
    job('inactive', 'urgent-joining', { not_active: true }),
    job('missing-state', 'urgent-joining', { state: '' }),
    job('pool', 'urgent-joining', { org_type: 'pool' }),
    job('private', 'urgent-joining', { show_on_ismira_web: false }),
  ] }, origin);
  assert.deepEqual(plain(result.sections), []);
  assert.equal(result.jobs.length, 0);
});

test('a selected JD appears once and jobs within each section sort newest first', () => {
  const old = job('old', 'urgent-joining', { updated_at: '2026-09-01', ismira_web_title: 'Old interview title' });
  const recent = job('new', 'urgent-joining', { updated_at: '2026-10-01' });
  const result = build({ priorityTypes: types, jobs: [old, recent, old] }, origin);
  assert.deepEqual(plain(result.sections?.[0]?.jobs.map(item => item.id)), ['new', 'old']);
  assert.equal(result.interviewJobs.length, 0);
});

test('custom and unassigned opening types remain visible when selected', () => {
  const result = build({ priorityTypes: [], jobs: [job('custom', 'new-type'), job('unassigned', '')] }, origin);
  assert.deepEqual(plain(result.sections?.map(section => [section.key, section.title])), [
    ['new-type', 'New Type'], ['other-openings', 'Other Openings'],
  ]);
});

test('company-specific views are distinct and public links and benefit labels survive grouping', () => {
  const result = build({ priorityTypes: types, benefitLabels: { meals: 'Free meals' }, jobs: [
    job('shared', 'urgent-joining', { view_id: 'shared:a', company: 'A', benefit_tags: ['meals'] }),
    job('shared', 'urgent-joining', { view_id: 'shared:b', company: 'B' }),
  ] }, origin);
  assert.equal(result.sections?.[0]?.jobs.length, 2);
  assert.match(result.jobs[0].details_url, /^https:\/\/jobs\.example\.test\/\?jd=/);
  assert.equal(result.benefitLabels.meals, 'Free meals');
});
