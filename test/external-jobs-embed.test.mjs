import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

async function mountFeed(payload, details = {}) {
  class Element {
    dataset = {};
    innerHTML = '';
    listeners = {};
    addEventListener(name, listener) { this.listeners[name] = listener; }
    closest() { return this; }
  }
  class HTMLElement extends Element {}
  const target = new HTMLElement();
  const list = new HTMLElement();
  const nodes = Object.fromEntries(['modal', 'modal-title', 'modal-company', 'modal-body'].map(role => [`[data-role="${role}"]`, new HTMLElement()]));
  target.querySelector = selector => selector === '[data-role="list"]' ? list : nodes[selector] ?? null;
  const window = {
    location: { href: 'https://website.example.test/', origin: 'https://website.example.test' },
    setInterval() {}, clearInterval() {}, addEventListener() {},
  };
  const document = {
    currentScript: null, readyState: 'complete', visibilityState: 'visible',
    querySelectorAll: () => [target], addEventListener() {}, body: { style: {} },
  };
  const requests = [];
  const context = { window, document, Element, HTMLElement, URL, console, fetch: async url => {
    requests.push(url);
    return { ok: true, json: async () => url.endsWith('/frontpage') ? payload : details };
  } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/embed/jobs/v4/mount.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { html: list.innerHTML, nodes, requests, async click(viewId) {
    const trigger = new HTMLElement();
    trigger.dataset.jobId = viewId;
    list.listeners.click({ target: trigger });
    await new Promise(resolve => setImmediate(resolve));
  } };
}
const renderFeed = async payload => (await mountFeed(payload)).html;
const job = (id, style = 'orange') => ({ id, name: id, priority_label: 'Priority Opening', priority_style: style });

test('embed renders grouped sections once, in feed order, and escapes configured headings', async () => {
  const html = await renderFeed({
    sections: [
      { key: 'active', title: 'Active Hiring', style: 'sky', jobs: [job('active', 'sky')] },
      { key: 'priority', title: 'Hot Jobs <special>', style: 'orange', jobs: [job('waiter')] },
      { key: 'live', title: 'Upcoming Interviews', style: 'pink', jobs: [job('interview', 'pink')] },
    ],
    jobs: [job('active'), job('waiter'), job('interview')], interviewJobs: [], benefitLabels: {},
  });
  assert.ok(html.includes('Active Hiring'));
  assert.ok(html.includes('Hot Jobs &lt;special&gt;'));
  assert.ok(html.indexOf('Active Hiring') < html.indexOf('Upcoming Interviews'));
  assert.equal((html.match(/data-job-id="waiter"/g) ?? []).length, 1);
  assert.equal((html.match(/<section /g) ?? []).length, 3);
  assert.ok(html.includes('ijf-section-title--pink'));
});

test('empty grouped feed does not render stale flat jobs and shows the empty message', async () => {
  const html = await renderFeed({ sections: [], jobs: [job('stale')], interviewJobs: [] });
  assert.match(html, /No matching jobs/);
  assert.equal(html.includes('data-job-id'), false);
});

test('embed still renders the old feed while an older API response is cached', async () => {
  const html = await renderFeed({ jobs: [job('old')], urgentTitle: 'Hot Jobs', interviewJobs: [job('live')], interviewsTitle: 'Interviews' });
  assert.ok(html.includes('Hot Jobs'));
  assert.ok(html.includes('Interviews'));
  assert.equal((html.match(/data-job-id=/g) ?? []).length, 2);
});

test('opening a company-specific view keeps its title, company, benefits and ship type in the modal', async () => {
  const selected = { ...job('shared'), view_id: 'shared:secondary', name: 'Secondary - Waiter', company: 'Secondary', ship_types: ['river'], benefit_tags: ['free_meals'] };
  const mounted = await mountFeed({ sections: [{ title: 'Hot Jobs', style: 'orange', jobs: [selected] }], benefitLabels: { free_meals: 'Free meals' } },
    { name: 'Primary - Waiter', company: 'Primary', ship_types: ['ocean'], benefit_tags: ['paid_medical'] });
  await mounted.click('shared:secondary');
  assert.equal(mounted.nodes['[data-role="modal"]'].hidden, false);
  assert.equal(mounted.nodes['[data-role="modal-title"]'].textContent, 'Secondary - Waiter');
  assert.equal(mounted.nodes['[data-role="modal-company"]'].textContent, 'Secondary');
  assert.match(mounted.nodes['[data-role="modal-body"]'].innerHTML, /Free meals/);
  assert.match(mounted.nodes['[data-role="modal-body"]'].innerHTML, /river/);
  assert.doesNotMatch(mounted.nodes['[data-role="modal-body"]'].innerHTML, /Paid Medical/);
  assert.ok(mounted.requests.at(-1).endsWith('/frontpage/shared'));
});
