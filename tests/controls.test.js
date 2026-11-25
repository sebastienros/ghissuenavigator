'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDocument } = require('./dom-stub.js');

globalThis.getComputedStyle = (el) => el.style;
const { mount, unmount, announce } = require('../src/controls.js');

function sampleModel(overrides = {}) {
  return {
    noun: 'issue',
    position: 4,
    total: 13,
    prev: { url: 'https://github.com/octo-org/sample-repo/issues/41', number: 41 },
    next: { url: 'https://github.com/octo-org/sample-repo/issues/43', number: 43 },
    listHref: 'https://github.com/octo-org/sample-repo/issues?q=label%3Afeedback',
    ...overrides,
  };
}

test('mounts primary controls on the outer header row even on narrow viewports, and preserves focus on updates', () => {
  const doc = new FakeDocument();
  // Mirrors GitHub's signed-in PR header: PageHeader > Description(col) > fgColor-muted(row) > actorGroup(row) > wrap > StateLabel
  const scope = doc.createElement('div');
  scope.className = 'prc-PageHeader-PageHeader-abc';
  scope.style = { display: 'grid', flexDirection: 'row' };
  scope.rect = { width: 400, height: 80, top: 0, left: 0 };

  const desc = doc.createElement('div');
  desc.style = { display: 'flex', flexDirection: 'column' };
  const outerRow = doc.createElement('div');
  outerRow.className = 'fgColor-muted d-flex';
  outerRow.style = { display: 'flex', flexDirection: 'row' };
  // Narrow viewport with horizontal padding: 340 / 400 = 0.85 (< 0.9).
  outerRow.rect = { width: 340, height: 32, top: 0, left: 0 };

  const actorGroup = doc.createElement('div');
  actorGroup.className = 'actorGroup';
  actorGroup.style = { display: 'flex', flexDirection: 'row' };
  actorGroup.rect = { width: 220, height: 32, top: 0, left: 0 };

  const badgeWrap = doc.createElement('div');
  badgeWrap.style = { display: 'flex', flexDirection: 'row' };
  const label = doc.createElement('span');
  label.className = 'prc-StateLabel-StateLabel-xyz';
  badgeWrap.appendChild(label);
  actorGroup.appendChild(badgeWrap);
  actorGroup.appendChild(doc.createElement('a'));
  outerRow.appendChild(actorGroup);
  outerRow.appendChild(doc.createElement('div'));
  desc.appendChild(outerRow);
  scope.appendChild(desc);
  doc.body.appendChild(scope);

  const pendingModel = sampleModel({ next: { pending: true } });
  assert.equal(mount(doc, pendingModel), true);
  assert.equal(outerRow.querySelector(':scope > .ghnav-bar--primary') !== null, true, 'mounted on outerRow, not actorGroup');
  assert.equal(actorGroup.querySelector(':scope > .ghnav-bar'), null);

  const nextBtn = outerRow.querySelector('[data-ghnav-step="next"]');
  nextBtn.focus();
  assert.equal(doc.activeElement, nextBtn);

  // Updating the model replaces the bar and restores focus to the new Next control.
  mount(doc, sampleModel());
  const updatedNext = outerRow.querySelector('[data-ghnav-step="next"]');
  assert.equal(updatedNext.href, 'https://github.com/octo-org/sample-repo/issues/43');
  assert.equal(doc.activeElement, updatedNext);
});

test('refuses to assign non-GitHub or javascript: URLs to href attributes', () => {
  const doc = new FakeDocument();
  mount(doc, sampleModel({
    prev: { url: 'javascript:alert(1)', number: 1 },
    next: { url: 'https://evil.example/issues/2', number: 2 },
    listHref: 'javascript:alert(2)',
  }), { allowFloating: true });

  const bar = doc.querySelector('.ghnav-floating');
  assert.equal(bar.querySelector('[data-ghnav-step="prev"]').hasAttribute('href'), false);
  assert.equal(bar.querySelector('[data-ghnav-step="next"]').hasAttribute('href'), false);
  assert.equal(bar.querySelector('[data-ghnav-step="list"]').hasAttribute('href'), false);
});

test('cancels earlier animation frames in announce() and clears the toast on unmount()', () => {
  const doc = new FakeDocument();
  const frames = new Map();
  let nextId = 1;
  const origRaf = globalThis.requestAnimationFrame;
  const origCaf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => { const id = nextId++; frames.set(id, cb); return id; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);

  try {
    announce(doc, 'Loading more of the list…');
    announce(doc, 'This is the last issue in the list.');
    assert.equal(frames.size, 1, 'earlier rAF was cancelled');
    for (const cb of frames.values()) cb();
    frames.clear();

    const toast = doc.getElementById('ghnav-toast');
    assert.equal(toast.textContent, 'This is the last issue in the list.');
    assert.equal(toast.classList.contains('ghnav-toast--visible'), true);

    unmount(doc);
    assert.equal(toast.classList.contains('ghnav-toast--visible'), false);
    assert.equal(toast.textContent, '');
  } finally {
    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCaf;
  }
});
