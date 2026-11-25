'use strict';

(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    prev: 'M10 3.5 5.5 8l4.5 4.5',
    next: 'M6 3.5 10.5 8 6 12.5',
    list: 'M6 3 2.5 6.5 6 10M2.5 6.5h7a4 4 0 0 1 4 4V13',
  };

  function icon(doc, name) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('ghnav-icon');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
    return svg;
  }

  function stepLink(doc, model, dir, compact) {
    const target = dir === 'next' ? model.next : model.prev;
    const word = dir === 'next' ? 'Next' : 'Previous';
    const shortcut = dir === 'next' ? 'Alt+]' : 'Alt+[';
    const a = doc.createElement('a');
    a.className = 'ghnav-btn';
    a.dataset.ghnavStep = dir;
    if (target === null) {
      a.setAttribute('role', 'link');
      a.setAttribute('aria-disabled', 'true');
      a.setAttribute('aria-label', `No ${word.toLowerCase()} ${model.noun} in this list`);
      a.title = `No ${word.toLowerCase()} ${model.noun} in this list`;
    } else {
      if (target.url) {
        a.href = target.url;
      } else {
        a.setAttribute('role', 'link');
        a.tabIndex = 0;
      }
      a.setAttribute('aria-label', target.number ? `${word} ${model.noun}, #${target.number}` : `${word} ${model.noun}`);
      a.title = `${word} ${model.noun} (${shortcut})`;
    }
    if (dir === 'prev') a.appendChild(icon(doc, 'prev'));
    if (!compact) {
      const label = doc.createElement('span');
      label.textContent = word;
      a.appendChild(label);
    }
    if (dir === 'next') a.appendChild(icon(doc, 'next'));
    return a;
  }

  function buildBar(doc, model, { compact = false } = {}) {
    const nav = doc.createElement('nav');
    nav.className = `ghnav-bar ${compact ? 'ghnav-bar--compact' : 'ghnav-bar--primary'}`;
    if (compact) {
      // A duplicate of the main controls for the scrolled header; hidden from assistive tech.
      nav.setAttribute('aria-hidden', 'true');
    } else {
      nav.setAttribute('aria-label', `Step through ${model.noun}s in this list`);
    }

    const group = doc.createElement('div');
    group.className = 'ghnav-group';
    group.appendChild(stepLink(doc, model, 'prev', compact));
    if (model.position && model.total) {
      const pos = doc.createElement('span');
      pos.className = 'ghnav-pos';
      pos.textContent = compact ? `${model.position}/${model.total}` : `${model.position} of ${model.total}`;
      if (!compact) pos.setAttribute('aria-label', `${model.position} of ${model.total} in this list`);
      group.appendChild(pos);
    }
    group.appendChild(stepLink(doc, model, 'next', compact));
    nav.appendChild(group);

    if (!compact) {
      const back = doc.createElement('a');
      back.className = 'ghnav-btn ghnav-btn--invisible';
      back.href = model.listHref;
      back.dataset.ghnavStep = 'list';
      back.title = 'Back to list (Alt+↑)';
      back.appendChild(icon(doc, 'list'));
      const label = doc.createElement('span');
      label.textContent = 'Back to list';
      back.appendChild(label);
      nav.appendChild(back);
    }

    if (compact) {
      for (const link of nav.querySelectorAll('a')) link.tabIndex = -1;
    }
    return nav;
  }

  // Newer pages use Primer's PageHeader; some pull request tabs still use the older .gh-header.
  const HEADER_SCOPES = '[data-testid="issue-metadata-fixed"], [data-testid="issue-metadata-sticky"], [class*="PageHeader-PageHeader"], .gh-header';
  const STATE_LABELS = '[data-testid="header-state"], [class*="StateLabel-StateLabel"], .gh-header .State';
  const COMPACT_SCOPES = '[data-testid="issue-metadata-sticky"], [class*="PageHeader-LeadingVisual"], .gh-header-sticky';

  // The controls go in the row under an issue or pull request title, the one
  // that holds the state label ("Open", "Todo"...). Its depth above the label
  // varies (for example, the label is a button when you can edit the issue),
  // so walk up to the first horizontal flex row spanning the header. Hidden
  // sticky headers have no width yet, so they use the first row that holds
  // more than the label.
  function rowFor(label, scope, compact) {
    const scopeWidth = scope.getBoundingClientRect().width;
    let fallback = null;
    for (let node = label.parentElement; node && node !== scope; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (!style.display.includes('flex') || style.flexDirection.startsWith('column')) continue;
      if (!fallback && node.children.length > 1) fallback = node;
      if (!compact && scopeWidth > 0 && node.getBoundingClientRect().width >= scopeWidth * 0.9) return node;
    }
    return fallback;
  }

  function findHosts(doc) {
    const hosts = [];
    for (const label of doc.querySelectorAll(STATE_LABELS)) {
      const scope = label.closest(HEADER_SCOPES);
      if (!scope) continue;
      const compact = Boolean(label.closest(COMPACT_SCOPES));
      const host = rowFor(label, scope, compact);
      if (!host || hosts.some((h) => h.host === host)) continue;
      hosts.push({ host, compact });
    }
    return hosts;
  }

  // Swaps in an updated bar without losing keyboard focus inside it.
  function replaceBar(doc, existing, bar) {
    const focused = existing.contains(doc.activeElement) ? doc.activeElement.dataset.ghnavStep : null;
    existing.replaceWith(bar);
    if (focused) {
      const target = bar.querySelector(`[data-ghnav-step="${focused}"]`);
      if (target) target.focus({ preventScroll: true });
    }
  }

  // Inserts or refreshes the controls. Returns false while GitHub's header
  // hasn't rendered yet, unless a floating fallback was requested.
  function mount(doc, model, { allowFloating = false } = {}) {
    const hosts = findHosts(doc);
    const serialized = JSON.stringify(model);
    const wanted = new Set();

    for (const { host, compact } of hosts) {
      const existing = host.querySelector(':scope > .ghnav-bar');
      if (existing && existing.dataset.model === serialized) {
        wanted.add(existing);
        continue;
      }
      const bar = buildBar(doc, model, { compact });
      bar.dataset.model = serialized;
      if (existing) replaceBar(doc, existing, bar);
      else host.appendChild(bar);
      wanted.add(bar);
    }

    const hasPrimary = hosts.some((h) => !h.compact);
    if (!hasPrimary && allowFloating) {
      let floating = doc.querySelector('body > .ghnav-floating');
      if (!floating || floating.dataset.model !== serialized) {
        const bar = buildBar(doc, model);
        bar.classList.add('ghnav-floating');
        bar.dataset.model = serialized;
        if (floating) replaceBar(doc, floating, bar);
        else doc.body.appendChild(bar);
        floating = bar;
      }
      wanted.add(floating);
    }

    for (const stale of doc.querySelectorAll('.ghnav-bar')) {
      if (!wanted.has(stale)) stale.remove();
    }
    return hasPrimary || allowFloating;
  }

  function unmount(doc) {
    for (const bar of doc.querySelectorAll('.ghnav-bar')) bar.remove();
  }

  let toastTimer = null;
  function announce(doc, message) {
    let toast = doc.getElementById('ghnav-toast');
    if (!toast) {
      toast = doc.createElement('div');
      toast.id = 'ghnav-toast';
      toast.setAttribute('role', 'status');
      doc.body.appendChild(toast);
    }
    // Change the text after the live region exists and is empty, so screen
    // readers announce it, including when the same message repeats.
    toast.textContent = '';
    clearTimeout(toastTimer);
    requestAnimationFrame(() => {
      toast.textContent = message;
      toast.classList.add('ghnav-toast--visible');
      toastTimer = setTimeout(() => {
        toast.classList.remove('ghnav-toast--visible');
        toast.textContent = '';
      }, 3000);
    });
  }

  globalThis.GhNav = Object.assign(globalThis.GhNav || {}, { mount, unmount, announce });
})();
