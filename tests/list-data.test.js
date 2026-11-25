'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListResponse } = require('../src/list-data.js');
const { issuesPayload, pullsPayload, htmlWithEmbedded } = require('./fixtures.js');

test('reads issues in page order from the JSON list response, ignoring pinned issues', () => {
  const page = parseListResponse(JSON.stringify(issuesPayload([30, 12, 25], { page: 2, totalPages: 3, totalCount: 53 })));
  assert.deepEqual(page.items.map((item) => item.number), [30, 12, 25]);
  assert.deepEqual(page.items[0], {
    key: 'octo-org/sample-repo#30',
    number: 30,
    url: 'https://github.com/octo-org/sample-repo/issues/30',
  });
  assert.equal(page.page, 2);
  assert.equal(page.totalPages, 3);
  assert.equal(page.totalCount, 53);
});

test('reads pull requests, whose page counts sit on the route itself', () => {
  const page = parseListResponse(JSON.stringify(pullsPayload([8, 5], { page: 1, totalPages: 2, totalCount: 27 })));
  assert.deepEqual(page.items.map((item) => item.url), [
    'https://github.com/octo-org/sample-repo/pull/8',
    'https://github.com/octo-org/sample-repo/pull/5',
  ]);
  assert.equal(page.totalPages, 2);
  assert.equal(page.totalCount, 27);
});

test('falls back to the data embedded in the HTML list page', () => {
  const page = parseListResponse(htmlWithEmbedded(issuesPayload([3, 2, 1])));
  assert.deepEqual(page.items.map((item) => item.number), [3, 2, 1]);
  assert.equal(page.totalPages, 1);
});

test('returns an empty page for a list with no results', () => {
  // GitHub leaves out results and counts entirely when nothing matches.
  const issues = parseListResponse('{"payload":{"issuesIndexContentRoute":{"pageInfo":{"currentPage":1},"issueSearchType":"LEXICAL"}}}');
  assert.deepEqual(issues, { items: [], page: 1, totalPages: null, totalCount: null });
  const pulls = parseListResponse('{"payload":{"repoPullsDashboardContentRoute":{"currentPage":1,"openCount":0,"closedCount":0}}}');
  assert.deepEqual(pulls.items, []);
});

test('treats a page past GitHub\'s page limit as empty', () => {
  const page = parseListResponse('{"payload":{"issuesIndexContentRoute":{"pageInfo":{"currentPage":45},"error":"page_limit_exceeded"}}}');
  assert.deepEqual(page, { items: [], page: 45, totalPages: null, totalCount: null });
});

test('finds the embedded data whatever the order of the script attributes', () => {
  const html = htmlWithEmbedded(issuesPayload([7])).replace(
    '<script type="application/json" data-target="react-app.embeddedData">',
    '<script data-target="react-app.embeddedData" nonce="abc" type="application/json">',
  );
  assert.deepEqual(parseListResponse(html).items.map((item) => item.number), [7]);
});

test('keeps only what stepping needs from each item', () => {
  const [item] = parseListResponse(JSON.stringify(issuesPayload([30]))).items;
  assert.deepEqual(Object.keys(item).sort(), ['key', 'number', 'url']);
});

test('treats explicit null counts as unknown rather than zero, and checks all embedded scripts', () => {
  const nullCounts = parseListResponse('{"payload":{"issuesIndexContentRoute":{"pageInfo":{"currentPage":3,"totalPages":null,"totalCount":null}}}}');
  assert.deepEqual(nullCounts, { items: [], page: 3, totalPages: null, totalCount: null });

  const multiScript = `<!DOCTYPE html><html><body>
<script type="application/json" data-target="react-app.embeddedData">{"payload":{"otherRoute":{}}}</script>
<script type="application/json" data-target='react-app.embeddedData'>${JSON.stringify(issuesPayload([11, 10]))}</script>
</body></html>`;
  assert.deepEqual(parseListResponse(multiScript).items.map((item) => item.number), [11, 10]);
});

test('reads mixed issue and pull request items from an issues search', () => {
  const payload = issuesPayload([12]);
  payload.payload.issuesIndexContentRoute.results.push({
    id: 'PR_9',
    itemType: 'REPO_ISSUES_DASHBOARD_ITEM_TYPE_PULL_REQUEST',
    pullRequest: {
      number: 9,
      title: 'Example PR 9',
      permalink: 'https://github.com/octo-org/sample-repo/pull/9',
    },
  });
  const page = parseListResponse(JSON.stringify(payload));
  assert.deepEqual(page.items.map((item) => item.url), [
    'https://github.com/octo-org/sample-repo/issues/12',
    'https://github.com/octo-org/sample-repo/pull/9',
  ]);
});

test('returns null when the response has no recognisable list', () => {
  assert.equal(parseListResponse('<html><body>Sign in to GitHub</body></html>'), null);
  assert.equal(parseListResponse('{"payload":{}}'), null);
  assert.equal(parseListResponse('{not json'), null);
});

test('skips malformed results instead of failing', () => {
  const json = issuesPayload([4]);
  json.payload.issuesIndexContentRoute.results.push({ issue: { title: 'no number' } }, null);
  assert.deepEqual(parseListResponse(JSON.stringify(json)).items.map((item) => item.number), [4]);
});
