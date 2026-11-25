'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { keyAction, isEditable } = require('../src/keys.js');

const key = (code, extra = {}) => ({ code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, ...extra });

test('maps Alt+] and Alt+[ by physical key, and marks the Alt+arrow aliases', () => {
  assert.deepEqual(keyAction(key('BracketRight')), { action: 'next', alias: false });
  assert.deepEqual(keyAction(key('BracketLeft')), { action: 'prev', alias: false });
  assert.deepEqual(keyAction(key('ArrowRight')), { action: 'next', alias: true });
  assert.deepEqual(keyAction(key('ArrowLeft')), { action: 'prev', alias: true });
  assert.deepEqual(keyAction(key('ArrowUp')), { action: 'list', alias: true });
});

test('ignores other modifiers, including AltGr, plain keys and text composition', () => {
  assert.equal(keyAction(key('BracketRight', { ctrlKey: true })), null);
  assert.equal(keyAction(key('BracketRight', { metaKey: true })), null);
  assert.equal(keyAction(key('BracketRight', { shiftKey: true })), null);
  assert.equal(keyAction(key('BracketRight', { altKey: false })), null);
  assert.equal(keyAction(key('BracketRight', { isComposing: true })), null);
  assert.equal(keyAction(key('KeyJ')), null);
});

test('recognises text fields so typing is never intercepted', () => {
  const el = (props) => ({ getAttribute: (name) => props[name] ?? null, ...props });
  assert.equal(isEditable(el({ tagName: 'TEXTAREA' })), true);
  assert.equal(isEditable(el({ tagName: 'INPUT', type: 'text' })), true);
  assert.equal(isEditable(el({ tagName: 'INPUT', type: 'checkbox' })), false);
  assert.equal(isEditable(el({ tagName: 'DIV', isContentEditable: true })), true);
  assert.equal(isEditable(el({ tagName: 'DIV', role: 'combobox' })), true);
  assert.equal(isEditable(el({ tagName: 'BUTTON' })), false);
  assert.equal(isEditable(null), false);
});
