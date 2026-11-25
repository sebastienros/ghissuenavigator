'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseContext, addHandoff, takeHandoff, pruneHandoffs, HANDOFF_MAX_AGE_MS } = require('../src/context.js');
const { parseRoute } = require('../src/routes.js');

const LIST_URL = 'https://github.com/octo-org/sample-repo/issues?q=label%3Afeedback&page=2';
const OTHER_LIST_URL = 'https://github.com/octo-org/sample-repo/issues?q=label%3Abug';
const list = parseRoute(LIST_URL);
const item = parseRoute('https://github.com/octo-org/sample-repo/issues/42');
const otherItem = parseRoute('https://github.com/octo-org/sample-repo/issues/7');
const NOW = 1_000_000;

const choose = (overrides) => chooseContext({
  route: item, prevRoute: null, prevInList: false, active: true, viaHistory: false, routeInList: false, handoffListUrl: null, ...overrides,
});

test('starts stepping when an item is opened from a list in the same repository', () => {
  assert.deepEqual(choose({ prevRoute: list }), { action: 'adopt', listUrl: list.listUrl, page: 2 });
});

test('does not start from a list in another repository', () => {
  assert.deepEqual(choose({ prevRoute: parseRoute('https://github.com/octo-org/other-repo/issues') }), { action: 'none' });
});

test('keeps the list only when arriving from an item in it, including a reload', () => {
  assert.deepEqual(choose({ prevRoute: otherItem, prevInList: true }), { action: 'keep' });
  assert.deepEqual(choose({ prevRoute: item, prevInList: true }), { action: 'keep' });
});

test('drops the list when arriving from anywhere else', () => {
  assert.deepEqual(choose({ prevRoute: otherItem, prevInList: false }), { action: 'none' });
  assert.deepEqual(choose({ prevRoute: parseRoute('https://github.com/notifications'), routeInList: true }), { action: 'none' });
  assert.deepEqual(choose({}), { action: 'none' });
});

test('does not revive a list that was left, even from an item that is in it', () => {
  assert.deepEqual(choose({ prevRoute: otherItem, prevInList: true, active: false }), { action: 'none' });
});

test('brings the list back when Back or Forward returns to one of its items', () => {
  assert.deepEqual(choose({ prevRoute: otherItem, viaHistory: true, routeInList: true, active: false }), { action: 'keep' });
  assert.deepEqual(choose({ prevRoute: otherItem, viaHistory: true, routeInList: false }), { action: 'none' });
});

test('uses a hand-off from another tab when the item was not opened from a list here', () => {
  assert.deepEqual(choose({ handoffListUrl: LIST_URL }), { action: 'adopt', listUrl: list.listUrl, page: 2 });
});

test('prefers the list clicked in this tab over an older hand-off', () => {
  const result = choose({ prevRoute: parseRoute(OTHER_LIST_URL), handoffListUrl: LIST_URL });
  assert.deepEqual(result, { action: 'adopt', listUrl: OTHER_LIST_URL, page: 1 });
});

test('does nothing away from item pages', () => {
  assert.deepEqual(choose({ route: list, prevRoute: list }), { action: 'none' });
});

test('hands a list to a new tab once, and only while fresh', () => {
  let entries = addHandoff([], { key: 'octo-org/sample-repo#42', listUrl: LIST_URL }, NOW);
  const taken = takeHandoff(entries, 'octo-org/sample-repo#42', NOW + 1000);
  assert.equal(taken.listUrl, LIST_URL);
  assert.equal(takeHandoff(taken.entries, 'octo-org/sample-repo#42', NOW + 1000).listUrl, null);

  entries = addHandoff([], { key: 'octo-org/sample-repo#42', listUrl: LIST_URL }, NOW);
  assert.equal(takeHandoff(entries, 'octo-org/sample-repo#42', NOW + HANDOFF_MAX_AGE_MS + 1).listUrl, null);
  assert.deepEqual(pruneHandoffs(entries, NOW + HANDOFF_MAX_AGE_MS + 1), []);
});

test('keeps the hand-off list small', () => {
  let entries = [];
  for (let i = 0; i < 50; i++) entries = addHandoff(entries, { key: `octo-org/sample-repo#${i}`, listUrl: LIST_URL }, NOW);
  assert.ok(entries.length <= 20);
  assert.equal(takeHandoff(entries, 'octo-org/sample-repo#49', NOW).listUrl, LIST_URL);
});
