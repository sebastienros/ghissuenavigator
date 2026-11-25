'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createQueue, addPage, locate, positionOf, step, missingPagesAround } = require('../src/queue.js');

const LIST = 'https://github.com/octo-org/sample-repo/issues?q=is%3Aissue';

function page(numbers, pageNumber, totalPages, totalCount) {
  return {
    page: pageNumber,
    totalPages,
    totalCount,
    items: numbers.map((n) => ({ key: `octo-org/sample-repo#${n}`, number: n, title: `Example ${n}`, url: `https://github.com/octo-org/sample-repo/issues/${n}` })),
  };
}

// Three pages of three: [9 8 7] [6 5 4] [3 2]
const p1 = page([9, 8, 7], 1, 3, 8);
const p2 = page([6, 5, 4], 2, 3, 8);
const p3 = page([3, 2], 3, 3, 8);

test('finds an item and its overall position', () => {
  const q = addPage(addPage(createQueue(LIST), p1), p2);
  const loc = locate(q, 'octo-org/sample-repo#5');
  assert.deepEqual(loc, { page: 2, index: 1 });
  assert.equal(positionOf(q, loc), 5);
  assert.equal(q.totalCount, 8);
  assert.equal(locate(q, 'octo-org/sample-repo#1'), null);
});

test('works out the page size from the last page when only that page is loaded', () => {
  const q = addPage(createQueue(LIST), p3);
  assert.equal(positionOf(q, locate(q, 'octo-org/sample-repo#2')), 8);
});

test('steps within a page and across loaded pages in both directions', () => {
  const q = addPage(addPage(createQueue(LIST), p1), p2);
  assert.equal(step(q, { page: 1, index: 0 }, 1).item.number, 8);
  assert.deepEqual(step(q, { page: 1, index: 2 }, 1).loc, { page: 2, index: 0 });
  assert.equal(step(q, { page: 2, index: 0 }, -1).item.number, 7);
});

test('asks for a page it has not loaded yet', () => {
  const q = addPage(createQueue(LIST), p2);
  assert.deepEqual(step(q, { page: 2, index: 2 }, 1), { needPage: 3 });
  assert.deepEqual(step(q, { page: 2, index: 0 }, -1), { needPage: 1 });
});

test('reports the ends of the list', () => {
  const q = addPage(addPage(createQueue(LIST), p1), p3);
  assert.deepEqual(step(q, { page: 1, index: 0 }, -1), { end: true });
  assert.deepEqual(step(q, { page: 3, index: 1 }, 1), { end: true });
});

test('skips an item that reappears on the next page after the list shifted', () => {
  const shifted = page([7, 6, 5], 2, 3, 8);
  const q = addPage(addPage(createQueue(LIST), p1), shifted);
  assert.equal(step(q, { page: 1, index: 2 }, 1).item.number, 6);
});

test('keeps the overall total current when a newer page reports a different count', () => {
  const q = addPage(addPage(createQueue(LIST), p1), page([6, 5], 2, 2, 5));
  assert.equal(q.totalCount, 5);
  assert.equal(q.totalPages, 2);
});

test('never bounces between two items when the next page has shifted by several', () => {
  // Two new items arrived before page 2 loaded, so it repeats 8 and 7.
  const shifted = page([8, 7, 6], 2, 3, 8);
  const q = addPage(addPage(createQueue(LIST), p1), shifted);
  const seen = [];
  let loc = locate(q, 'octo-org/sample-repo#9');
  for (let i = 0; i < 4; i++) {
    const result = step(q, loc, 1);
    if (!result.item) break;
    seen.push(result.item.number);
    loc = locate(q, result.item.key);
  }
  assert.deepEqual(seen, [8, 7, 6]);
  assert.equal(step(q, locate(q, 'octo-org/sample-repo#6'), -1).item.number, 7);
});

test('can still step back through loaded pages after the list shrinks', () => {
  const q = addPage(addPage(createQueue(LIST), page([3, 2], 5, 5, 14)), page([6, 5, 4], 4, 3, 8));
  assert.equal(step(q, { page: 5, index: 0 }, -1).item.number, 4);
});

test('treats an empty page beyond the end as the end of the list and keeps the totals', () => {
  const q = addPage(addPage(createQueue(LIST), p2), { page: 3, items: [], totalPages: null, totalCount: null });
  assert.equal(q.totalCount, 8);
  assert.equal(q.totalPages, 2);
  assert.deepEqual(step(q, { page: 2, index: 2 }, 1), { end: true });

  const emptyFirst = addPage(createQueue(LIST), { page: 1, items: [], totalPages: null, totalCount: null });
  assert.equal(emptyFirst.totalPages, 1);
  assert.equal(emptyFirst.totalCount, 0);
});

test('does not infer an impossible page size from a capped last page', () => {
  // GitHub stops at 40 pages but still reports the full count.
  const q = addPage(createQueue(LIST), page([10, 9], 40, 40, 3941));
  assert.equal(positionOf(q, { page: 40, index: 0 }), null);
});

test('loads every page of a short list, but only the neighbours of a long one', () => {
  const short = addPage(createQueue(LIST), p2);
  assert.deepEqual(missingPagesAround(short, 2), [1, 3]);
  const long = addPage(createQueue(LIST), page([60, 59], 6, 40, 1000));
  assert.deepEqual(missingPagesAround(long, 6), [7, 5]);
  const done = addPage(addPage(addPage(createQueue(LIST), p1), p2), p3);
  assert.deepEqual(missingPagesAround(done, 2), []);
});
