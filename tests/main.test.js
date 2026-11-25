'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDocument, FakeElement, createStorage } = require('./dom-stub.js');
const { issuesPayload, pullsPayload, htmlWithEmbedded } = require('./fixtures.js');

const routes = require('../src/routes.js');
const listData = require('../src/list-data.js');
const queue = require('../src/queue.js');
const context = require('../src/context.js');
const keys = require('../src/keys.js');
globalThis.getComputedStyle = (el) => el.style;
const controls = require('../src/controls.js');
const { startNavigator } = require('../src/main.js');

function createHarness(initialHref, { referrer = 'https://github.com/octo-org/sample-repo/issues', navType = 'navigate', fetchImpl } = {}) {
  const doc = new FakeDocument();
  doc.referrer = referrer;
  // Mount a Primer header row so mount() succeeds immediately without waiting for floating fallback.
  const scope = doc.createElement('div');
  scope.setAttribute('data-testid', 'issue-metadata-fixed');
  scope.rect = { width: 1000, height: 40, top: 0, left: 0 };
  const row = doc.createElement('div');
  row.style = { display: 'flex', flexDirection: 'row' };
  row.rect = { width: 1000, height: 32, top: 0, left: 0 };
  const wrap = doc.createElement('div');
  wrap.style = { display: 'flex', flexDirection: 'row' };
  const badge = doc.createElement('span');
  badge.setAttribute('data-testid', 'header-state');
  wrap.appendChild(badge);
  row.appendChild(wrap);
  row.appendChild(doc.createElement('span'));
  scope.appendChild(row);
  doc.body.appendChild(scope);

  const sessionStorage = createStorage();
  const localStorage = createStorage();
  const winListeners = new Map();
  const navigated = [];
  const location = {
    href: initialHref,
    get origin() { return new URL(this.href).origin; },
    get pathname() { return new URL(this.href).pathname; },
    get search() { return new URL(this.href).search; },
    assign(url) {
      navigated.push(url);
      this.href = url;
    },
  };

  const env = {
    N: { ...routes, ...listData, ...queue, ...context, ...keys, ...controls },
    document: doc,
    window: {
      addEventListener(type, fn) {
        if (!winListeners.has(type)) winListeners.set(type, []);
        winListeners.get(type).push(fn);
      },
    },
    location,
    sessionStorage,
    localStorage,
    performance: { getEntriesByType: () => [{ type: navType }] },
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, redirected: false, url: initialHref, text: async () => JSON.stringify(issuesPayload([10, 9, 8])) })),
    MutationObserver: class {
      constructor(cb) { this.cb = cb; }
      observe() { doc.observers.add(this); }
      disconnect() { doc.observers.delete(this); }
      trigger() {}
    },
    Element: FakeElement,
    setInterval: () => 1,
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: (cb) => { cb(); return 1; },
  };

  const controller = startNavigator(env);
  return { env, doc, location, sessionStorage, localStorage, navigated, controller };
}

test('keeps controls when switching PR tabs before the initial list fetch resolves', async () => {
  let resolveFetch;
  const fetchCalls = [];
  const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
  const h = createHarness('https://github.com/octo-org/sample-repo/pulls', {
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      await fetchPromise;
      return {
        ok: true,
        status: 200,
        redirected: false,
        url,
        text: async () => JSON.stringify(pullsPayload([7, 5])),
      };
    },
  });

  await h.controller.flush();

  // User clicks PR #7 from the list, then clicks /pull/7/files before loadPage resolves.
  h.location.href = 'https://github.com/octo-org/sample-repo/pull/7';
  const firstTransition = h.controller.checkRoute();
  h.location.href = 'https://github.com/octo-org/sample-repo/pull/7/files';
  const secondTransition = h.controller.checkRoute();

  resolveFetch();
  await Promise.all([firstTransition, secondTransition]);
  await h.controller.flush();

  const bar = h.doc.querySelector('.ghnav-bar--primary');
  assert.ok(bar, 'controls remain mounted on /pull/7/files');
  assert.equal(bar.querySelector('.ghnav-pos').textContent, '1 of 2');
  assert.equal(fetchCalls.length, 1);
});

test('rejects tampered javascript: or cross-origin URLs in sessionStorage state', async () => {
  const h = createHarness('https://github.com/octo-org/sample-repo/issues/10');
  await h.controller.flush();

  // Simulate tampered sessionStorage loaded on a pageshow / fresh start.
  const tampered = {
    listUrl: 'https://github.com/octo-org/sample-repo/issues',
    active: true,
    queue: {
      listUrl: 'https://github.com/octo-org/sample-repo/issues',
      totalPages: 1,
      totalCount: 2,
      pageSize: null,
      pages: {
        1: [
          { key: 'octo-org/sample-repo#10', number: 10, url: 'https://github.com/octo-org/sample-repo/issues/10' },
          { key: 'octo-org/sample-repo#9', number: 9, url: 'javascript:alert(1)' },
        ],
      },
    },
  };
  const h2 = createHarness('https://github.com/octo-org/sample-repo/issues/10', {
    referrer: 'https://github.com/octo-org/sample-repo/issues/10',
    navType: 'reload',
  });
  h2.sessionStorage.setItem('ghnav:state', JSON.stringify(tampered));
  h2.sessionStorage.setItem('ghnav:prev', JSON.stringify('https://github.com/octo-org/sample-repo/issues/10'));
  const c2 = startNavigator({ ...h2.env });
  await c2.flush();

  assert.equal(h2.doc.querySelector('.ghnav-bar'), null, 'tampered state is discarded');
});

test('falls back to HTML embedded data when Accept: application/json returns 406', async () => {
  const calls = [];
  const h = createHarness('https://github.com/octo-org/sample-repo/issues', {
    fetchImpl: async (url, opts) => {
      calls.push(opts.headers.Accept);
      if (opts.headers.Accept === 'application/json') {
        return { ok: false, status: 406, redirected: false, url, text: async () => '' };
      }
      return {
        ok: true,
        status: 200,
        redirected: false,
        url,
        text: async () => htmlWithEmbedded(issuesPayload([20, 19])),
      };
    },
  });
  await h.controller.flush();

  h.location.href = 'https://github.com/octo-org/sample-repo/issues/20';
  await h.controller.checkRoute();

  assert.deepEqual(calls, ['application/json', 'text/html']);
  assert.equal(h.doc.querySelector('.ghnav-pos').textContent, '1 of 2');
});

test('captures a pushState list filter change clicked before the 250ms poll, and avoids double-fetching on Alt+]', async () => {
  const fetchedUrls = [];
  const h = createHarness('https://github.com/octo-org/sample-repo/issues', {
    fetchImpl: async (url) => {
      fetchedUrls.push(url);
      return { ok: true, status: 200, redirected: false, url, text: async () => JSON.stringify(issuesPayload([33, 32])) };
    },
  });
  await h.controller.flush();

  // GitHub's React filter updates location.href via pushState; user immediately clicks an issue before setInterval runs.
  h.location.href = 'https://github.com/octo-org/sample-repo/issues?q=is%3Aissue+label%3Aurgent';
  const link = h.doc.createElement('a');
  link.href = 'https://github.com/octo-org/sample-repo/issues/33';
  h.doc.body.appendChild(link);
  h.doc.dispatch('click', { type: 'click', target: link, ctrlKey: false, metaKey: false, shiftKey: false });

  h.location.href = 'https://github.com/octo-org/sample-repo/issues/33';
  await h.controller.checkRoute();
  assert.equal(fetchedUrls[0], 'https://github.com/octo-org/sample-repo/issues?q=is%3Aissue+label%3Aurgent');

  // Now return to the filtered list and press Alt+]: page 1 should be fetched once, not re-fetched on arrival.
  fetchedUrls.length = 0;
  h.location.href = 'https://github.com/octo-org/sample-repo/issues?q=is%3Aissue+label%3Aurgent';
  await h.controller.checkRoute();
  h.doc.dispatch('keydown', {
    code: 'BracketRight', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false,
    repeat: false, isComposing: false, target: h.doc.body,
    preventDefault() {}, stopPropagation() {},
  });
  await h.controller.flush();
  assert.equal(h.navigated.at(-1), 'https://github.com/octo-org/sample-repo/issues/33');
  await h.controller.checkRoute();
  assert.equal(fetchedUrls.length, 1, 'did not re-fetch page 1 upon arriving at #33');
});

test('steps across an entirely duplicate page, and cancels superseded async steps', async () => {
  let resolvePage2;
  const page2Gate = new Promise((resolve) => { resolvePage2 = resolve; });
  const h = createHarness('https://github.com/octo-org/sample-repo/issues', {
    fetchImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get('page') || 1);
      if (page === 1) {
        return { ok: true, status: 200, redirected: false, url, text: async () => JSON.stringify(issuesPayload([50, 49], { page: 1, totalPages: 6, totalCount: 12 })) };
      }
      if (page === 2) {
        await page2Gate;
        // All items on page 2 already appeared on page 1 after new issues opened.
        return { ok: true, status: 200, redirected: false, url, text: async () => JSON.stringify(issuesPayload([50, 49], { page: 2, totalPages: 6, totalCount: 12 })) };
      }
      return { ok: true, status: 200, redirected: false, url, text: async () => JSON.stringify(issuesPayload([48, 47], { page: 3, totalPages: 6, totalCount: 12 })) };
    },
  });
  await h.controller.flush();

  h.location.href = 'https://github.com/octo-org/sample-repo/issues/49';
  const enterPromise = h.controller.checkRoute();
  // Press Alt+] while page 2 is still gated, then immediately press Alt+[ (#50 is already loaded on page 1).
  setTimeout(() => {}, 0);
  // Wait until page 1 finished loading so #49 is mounted and page 2 fillAround is waiting on page2Gate.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  h.doc.dispatch('keydown', {
    code: 'BracketRight', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false,
    repeat: false, isComposing: false, target: h.doc.body,
    preventDefault() {}, stopPropagation() {},
  });
  h.doc.dispatch('keydown', {
    code: 'BracketLeft', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false,
    repeat: false, isComposing: false, target: h.doc.body,
    preventDefault() {}, stopPropagation() {},
  });
  assert.equal(h.navigated.at(-1), 'https://github.com/octo-org/sample-repo/issues/50', 'Alt+[ navigated immediately');

  resolvePage2();
  await enterPromise;
  await h.controller.flush();
  assert.equal(h.navigated.at(-1), 'https://github.com/octo-org/sample-repo/issues/50', 'superseded Alt+] did not overwrite navigation');

  // Now return to #49 and press Alt+] uninterrupted: should skip duplicate page 2 and land on #48 from page 3.
  h.location.href = 'https://github.com/octo-org/sample-repo/issues/49';
  await h.controller.checkRoute();
  h.doc.dispatch('keydown', {
    code: 'BracketRight', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false,
    repeat: false, isComposing: false, target: h.doc.body,
    preventDefault() {}, stopPropagation() {},
  });
  await h.controller.flush();
  assert.equal(h.navigated.at(-1), 'https://github.com/octo-org/sample-repo/issues/48');
});
