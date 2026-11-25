'use strict';

// Minimal DOM and storage doubles for exercising controls.js and main.js in node --test.

function splitSelectorList(selector) {
  return selector.split(',').map((part) => part.trim()).filter(Boolean);
}

function matchSimple(el, token) {
  if (!el || el.nodeType !== 1) return false;
  let rest = token.trim();
  const tagMatch = rest.match(/^[a-zA-Z0-9-]+/);
  if (tagMatch) {
    if (el.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  const attrPattern = /#([a-zA-Z0-9_-]+)|\.([a-zA-Z0-9_-]+)|\[([a-zA-Z0-9_-]+)(?:(\*=|=)['"]?([^'"\]]*)['"]?)?\]/g;
  let match;
  let consumed = 0;
  while ((match = attrPattern.exec(rest)) !== null) {
    consumed += match[0].length;
    if (match[1] && el.id !== match[1]) return false;
    if (match[2] && !el.classList.contains(match[2])) return false;
    if (match[3]) {
      const actual = el.getAttribute(match[3]);
      if (actual === null) return false;
      if (match[4] === '=' && actual !== match[5]) return false;
      if (match[4] === '*=' && !actual.includes(match[5])) return false;
    }
  }
  return consumed === rest.length;
}

function matchesSingle(el, selector, scope) {
  const tokens = selector.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
  let idx = tokens.length - 1;
  let node = el;
  const matchToken = (target, tok) => (tok === ':scope' ? target === scope : matchSimple(target, tok));
  if (!matchToken(node, tokens[idx])) return false;
  idx--;
  while (idx >= 0) {
    if (tokens[idx] === '>') {
      idx--;
      node = node.parentElement;
      if (!node || !matchToken(node, tokens[idx])) return false;
      idx--;
    } else {
      const wanted = tokens[idx];
      node = node.parentElement;
      while (node && !matchToken(node, wanted)) node = node.parentElement;
      if (!node) return false;
      idx--;
    }
  }
  return true;
}

function matchesSelector(el, selector, scope) {
  return splitSelectorList(selector).some((single) => matchesSingle(el, single, scope));
}

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.nodeType = 1;
    this.ownerDocument = ownerDocument;
    this.tagName = String(tagName).toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.style = { display: 'block', flexDirection: 'row' };
    this.rect = { width: 0, height: 0, top: 0, left: 0 };
    this.textContent = '';
    this.tabIndex = 0;
    this.isContentEditable = false;
    const self = this;
    this.dataset = new Proxy({}, {
      get(_, prop) {
        const attr = `data-${String(prop).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
        return self.getAttribute(attr) ?? undefined;
      },
      set(_, prop, value) {
        const attr = `data-${String(prop).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
        self.setAttribute(attr, String(value));
        return true;
      },
    });
    this.classList = {
      add: (...names) => {
        const set = new Set(self.className.split(/\s+/).filter(Boolean));
        for (const n of names) set.add(n);
        self.className = [...set].join(' ');
      },
      remove: (...names) => {
        const set = new Set(self.className.split(/\s+/).filter(Boolean));
        for (const n of names) set.delete(n);
        self.className = [...set].join(' ');
      },
      contains: (name) => self.className.split(/\s+/).filter(Boolean).includes(name),
    };
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get href() { return this.getAttribute('href') || ''; }
  set href(v) { this.setAttribute('href', v); }
  get title() { return this.getAttribute('title') || ''; }
  set title(v) { this.setAttribute('title', v); }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }

  appendChild(child) {
    if (child.parentElement) child.remove();
    child.parentElement = this;
    this.children.push(child);
    this.ownerDocument.notifyMutation();
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const idx = siblings.indexOf(this);
    if (idx >= 0) siblings.splice(idx, 1);
    if (this.ownerDocument.activeElement && this.contains(this.ownerDocument.activeElement)) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
    this.parentElement = null;
    this.ownerDocument.notifyMutation();
  }

  replaceWith(replacement) {
    if (!this.parentElement) return;
    if (replacement.parentElement) replacement.remove();
    const parent = this.parentElement;
    const idx = parent.children.indexOf(this);
    if (this.ownerDocument.activeElement && this.contains(this.ownerDocument.activeElement)) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
    this.parentElement = null;
    replacement.parentElement = parent;
    parent.children[idx] = replacement;
    this.ownerDocument.notifyMutation();
  }

  contains(other) {
    for (let n = other; n; n = n.parentElement) {
      if (n === this) return true;
    }
    return false;
  }

  focus() {
    if (this.tagName === 'A' && !this.hasAttribute('href') && !this.attributes.has('tabindex') && this.getAttribute('aria-disabled') === 'true') {
      return;
    }
    this.ownerDocument.activeElement = this;
  }

  closest(selector) {
    for (let n = this; n; n = n.parentElement) {
      if (matchesSelector(n, selector, this)) return n;
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector, this)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getBoundingClientRect() {
    return { ...this.rect };
  }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.observers = new Set();
    this.referrer = '';
    this.documentElement = new FakeElement(this, 'html');
    this.body = new FakeElement(this, 'body');
    this.documentElement.children.push(this.body);
    this.body.parentElement = this.documentElement;
    this.activeElement = this.body;
  }

  createElement(tag) { return new FakeElement(this, tag); }
  createElementNS(_, tag) { return new FakeElement(this, tag); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  getElementById(id) { return this.querySelector(`#${id}`); }
  notifyMutation() {
    for (const obs of this.observers) obs.trigger();
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type, event) {
    for (const fn of this.listeners.get(type) || []) fn(event);
  }
}

function createStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    raw: store,
  };
}

module.exports = { FakeElement, FakeDocument, createStorage };
