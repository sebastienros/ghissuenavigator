'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRoute, listPageUrl } = require('../src/routes.js');

test('recognises a filtered issues list and drops the page from its list URL', () => {
  const route = parseRoute('https://github.com/Octo-Org/Sample-Repo/issues?q=is%3Aissue+label%3Afeedback&page=3#top');
  assert.deepEqual(route, {
    kind: 'list',
    repo: 'octo-org/sample-repo',
    type: 'issues',
    listUrl: 'https://github.com/Octo-Org/Sample-Repo/issues?q=is%3Aissue+label%3Afeedback',
    page: 3,
  });
});

test('recognises a pull request list with a trailing slash and no query', () => {
  const route = parseRoute('https://github.com/octo-org/sample-repo/pulls/');
  assert.equal(route.kind, 'list');
  assert.equal(route.type, 'pulls');
  assert.equal(route.listUrl, 'https://github.com/octo-org/sample-repo/pulls');
  assert.equal(route.page, 1);
});

test('recognises issue and pull request pages, including pull request tabs', () => {
  assert.deepEqual(parseRoute('https://github.com/Octo-Org/sample-repo/issues/42#issuecomment-1'), {
    kind: 'item', repo: 'octo-org/sample-repo', number: 42, key: 'octo-org/sample-repo#42',
  });
  assert.equal(parseRoute('https://github.com/octo-org/sample-repo/pull/7/files').key, 'octo-org/sample-repo#7');
});

test('ignores pages that are neither lists nor items', () => {
  for (const href of [
    'https://github.com/octo-org/sample-repo/issues/new',
    'https://github.com/octo-org/sample-repo',
    'https://github.com/issues',
    'https://gist.github.com/octo-org/sample-repo/issues',
    'http://github.com/octo-org/sample-repo/issues',
    'not a url',
  ]) {
    assert.equal(parseRoute(href).kind, 'other', href);
  }
});

test('builds the URL for a given page of a list', () => {
  const list = 'https://github.com/octo-org/sample-repo/issues?q=is%3Aissue';
  assert.equal(listPageUrl(list, 1), list);
  assert.equal(listPageUrl(list, 4), `${list}&page=4`);
  assert.equal(listPageUrl('https://github.com/octo-org/sample-repo/pulls', 2), 'https://github.com/octo-org/sample-repo/pulls?page=2');
});
