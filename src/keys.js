'use strict';

(() => {
  // Physical key codes, so the shortcuts work on any keyboard layout. The
  // arrow aliases clash with the browser's Back and Forward, so callers only
  // honour them while stepping through a list.
  const ACTIONS = {
    BracketRight: { action: 'next', alias: false },
    BracketLeft: { action: 'prev', alias: false },
    ArrowRight: { action: 'next', alias: true },
    ArrowLeft: { action: 'prev', alias: true },
    ArrowUp: { action: 'list', alias: true },
  };

  const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'email', 'password', 'number', 'tel', 'date', 'datetime-local', 'month', 'time', 'week']);
  const TEXT_ROLES = new Set(['textbox', 'combobox', 'searchbox']);

  function keyAction(event) {
    // AltGr reports as Ctrl+Alt on Windows; leave it to the keyboard layout.
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return null;
    return ACTIONS[event.code] ? { ...ACTIONS[event.code] } : null;
  }

  function isEditable(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = String(target.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return TEXT_INPUT_TYPES.has(String(target.type || '').toLowerCase());
    if (typeof target.getAttribute === 'function' && TEXT_ROLES.has(target.getAttribute('role'))) return true;
    return typeof target.closest === 'function'
      && Boolean(target.closest('[contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"]'));
  }

  const api = { keyAction, isEditable };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.GhNav = Object.assign(globalThis.GhNav || {}, api);
})();
