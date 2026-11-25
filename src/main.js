'use strict';

(() => {
  const N = globalThis.GhNav;
  if (!N || N.running) return;
  N.running = true;

  const STATE_KEY = 'ghnav:state';
  const PREV_KEY = 'ghnav:prev';
  const EXPECT_KEY = 'ghnav:expect';
  const HANDOFF_KEY = 'ghnav:handoff';
  const LEGACY_KEY = 'github-navigator-issues';
  const FLOATING_DELAY_MS = 4000;

  function read(storage, key) {
    try {
      return JSON.parse(storage.getItem(key));
    } catch {
      return null;
    }
  }

  function write(storage, key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be full or blocked; stepping still works for this page.
    }
  }

  function validState(value) {
    const ok = value && typeof value.listUrl === 'string' && N.parseRoute(value.listUrl).kind === 'list'
      && value.queue && value.queue.pages && typeof value.queue.pages === 'object';
    return ok ? value : null;
  }

  write(localStorage, LEGACY_KEY, null);
  const storedHandoffs = N.pruneHandoffs(read(localStorage, HANDOFF_KEY), Date.now());
  write(localStorage, HANDOFF_KEY, storedHandoffs.length ? storedHandoffs : null);

  // { listUrl, queue, active }: the list this tab is stepping through.
  let state = validState(read(sessionStorage, STATE_KEY));
  let currentKey = null;
  let routeStartedAt = 0;
  let model = null;
  let floatingTimer = null;
  let viaHistory = false;
  let firstRoute = true;
  const inflight = new Map();

  const hrefKey = (href) => {
    const url = new URL(href);
    return url.origin + url.pathname + url.search;
  };
  const isCurrent = (key) => hrefKey(location.href) === key;
  const nounFor = () => (/\/pull\/\d+/.test(location.pathname) ? 'pull request' : 'issue');
  const inList = (key) => Boolean(state && N.locate(state.queue, key));

  function saveState() {
    write(sessionStorage, STATE_KEY, state);
  }

  async function fetchListPage(listUrl, page) {
    const url = N.listPageUrl(listUrl, page);
    for (const accept of ['application/json', 'text/html']) {
      const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: accept } });
      if (response.redirected && /\/(login|session|sso)\b/.test(new URL(response.url).pathname)) {
        throw new Error('sign in to GitHub to step through this list');
      }
      if (!response.ok) throw new Error(`GitHub returned ${response.status} for the list`);
      const data = N.parseListResponse(await response.text());
      if (data) return data;
    }
    throw new Error('GitHub returned a list this extension does not recognise');
  }

  function loadPage(page) {
    const { listUrl } = state;
    const id = `${listUrl}|${page}`;
    if (!inflight.has(id)) {
      const request = fetchListPage(listUrl, page)
        .then((data) => {
          if (state && state.listUrl === listUrl) {
            state.queue = N.addPage(state.queue, data);
            saveState();
          }
        })
        .finally(() => inflight.delete(id));
      inflight.set(id, request);
    }
    return inflight.get(id);
  }

  function buildModel(routeKey) {
    const loc = state && N.locate(state.queue, routeKey);
    if (!loc) return null;
    const side = (direction) => {
      const result = N.step(state.queue, loc, direction);
      if (result.item) return { url: result.item.url, number: result.item.number };
      return result.needPage ? { pending: true } : null;
    };
    const position = N.positionOf(state.queue, loc);
    const total = state.queue.totalCount;
    return {
      noun: nounFor(),
      position,
      // The list can shrink while stepping; never show "9 of 8".
      total: position && total !== null ? Math.max(position, total) : total,
      prev: side(-1),
      next: side(1),
      listHref: N.listPageUrl(state.listUrl, loc.page),
    };
  }

  // GitHub re-renders its header as data loads; put the controls back if
  // they're removed. Only watch while there are controls to keep.
  let mountQueued = false;
  const observer = new MutationObserver(() => {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(() => {
      mountQueued = false;
      mountNow();
    });
  });

  function mountNow() {
    if (!model) return;
    const allowFloating = Date.now() - routeStartedAt >= FLOATING_DELAY_MS;
    if (!N.mount(document, model, { allowFloating }) && !floatingTimer) {
      floatingTimer = setTimeout(() => {
        floatingTimer = null;
        mountNow();
      }, FLOATING_DELAY_MS);
    }
  }

  function clearControls() {
    model = null;
    observer.disconnect();
    clearTimeout(floatingTimer);
    floatingTimer = null;
    N.unmount(document);
  }

  function render(routeKey) {
    const next = buildModel(routeKey);
    if (!next) {
      clearControls();
      return;
    }
    if (!model) observer.observe(document.documentElement, { childList: true, subtree: true });
    model = next;
    mountNow();
  }

  async function fillAround(routeKey, key, fallbackPage) {
    const loc = N.locate(state.queue, routeKey);
    // If the list shifted since it was shown, the item may be on a neighbouring page.
    const pages = loc
      ? N.missingPagesAround(state.queue, loc.page)
      : [fallbackPage + 1, fallbackPage - 1].filter((n) => n >= 1 && !state.queue.pages[n]
        && !(state.queue.totalPages && n > state.queue.totalPages));
    for (const page of pages) {
      try {
        await loadPage(page);
      } catch (error) {
        console.warn('GitHub Issues Navigator:', error.message);
        return;
      }
      if (!isCurrent(key)) return;
      render(routeKey);
    }
    if (!loc && N.locate(state.queue, routeKey)) await fillAround(routeKey, key, fallbackPage);
  }

  // A page reached by typing a URL or following a link from another site
  // must not inherit the list this tab was on before. Pages this extension
  // opened itself are trusted, since some browsers send no referrer for them.
  function previousHref() {
    const stored = read(sessionStorage, PREV_KEY);
    if (!firstRoute) return stored;
    firstRoute = false;
    const expected = read(sessionStorage, EXPECT_KEY);
    write(sessionStorage, EXPECT_KEY, null);
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'back_forward') viaHistory = true;
    if (expected === hrefKey(location.href)) return stored;
    const fromGitHub = document.referrer.startsWith('https://github.com/');
    return nav && nav.type === 'navigate' && !fromGitHub ? null : stored;
  }

  function navigate(url) {
    write(sessionStorage, EXPECT_KEY, hrefKey(url));
    location.assign(url);
  }

  async function onRoute() {
    const key = hrefKey(location.href);
    if (key === currentKey) {
      viaHistory = false;
      return;
    }
    currentKey = key;
    routeStartedAt = Date.now();
    clearControls();

    const route = N.parseRoute(location.href);
    const prevHref = previousHref();
    const history = viaHistory;
    viaHistory = false;
    write(sessionStorage, PREV_KEY, location.href);
    if (route.kind !== 'item') return;

    const prevRoute = typeof prevHref === 'string' ? N.parseRoute(prevHref) : null;
    const handoff = N.takeHandoff(read(localStorage, HANDOFF_KEY), route.key, Date.now());
    if (handoff.listUrl) write(localStorage, HANDOFF_KEY, handoff.entries.length ? handoff.entries : null);

    const decision = N.chooseContext({
      route,
      prevRoute,
      prevInList: Boolean(prevRoute && prevRoute.kind === 'item' && inList(prevRoute.key)),
      active: Boolean(state && state.active),
      viaHistory: history,
      routeInList: inList(route.key),
      handoffListUrl: handoff.listUrl,
    });

    if (decision.action === 'none') {
      if (state && state.active) {
        state.active = false;
        saveState();
      }
      return;
    }
    if (decision.action === 'adopt') {
      state = { listUrl: decision.listUrl, queue: N.createQueue(decision.listUrl), active: true };
      saveState();
      try {
        await loadPage(decision.page);
      } catch (error) {
        console.warn('GitHub Issues Navigator:', error.message);
      }
    } else if (!state.active) {
      state.active = true;
      saveState();
    }
    if (!isCurrent(key)) return;
    render(route.key);
    await fillAround(route.key, key, decision.page || 1);
  }

  function checkRoute() {
    onRoute().catch((error) => console.warn('GitHub Issues Navigator:', error));
  }

  function canHandle({ action, alias }) {
    const route = N.parseRoute(location.href);
    // On a list, Alt+arrows stay the browser's Back and Forward.
    if (route.kind === 'list') return !alias && action !== 'list';
    return route.kind === 'item' && Boolean(model);
  }

  async function startFromList(route, action) {
    const key = hrefKey(location.href);
    state = { listUrl: route.listUrl, queue: N.createQueue(route.listUrl), active: true };
    saveState();
    try {
      await loadPage(route.page);
    } catch (error) {
      N.announce(document, `Couldn't load this list: ${error.message}.`);
      return;
    }
    if (!isCurrent(key)) return;
    const items = state.queue.pages[route.page] || [];
    if (!items.length) {
      N.announce(document, 'There is nothing in this list to step through.');
      return;
    }
    navigate((action === 'next' ? items[0] : items[items.length - 1]).url);
  }

  async function go(action) {
    const key = hrefKey(location.href);
    const route = N.parseRoute(location.href);
    if (route.kind === 'list') return startFromList(route, action);
    if (route.kind !== 'item' || !state) return;

    let loc = N.locate(state.queue, route.key);
    if (!loc) return;
    if (action === 'list') {
      navigate(N.listPageUrl(state.listUrl, loc.page));
      return;
    }

    const direction = action === 'next' ? 1 : -1;
    let result = N.step(state.queue, loc, direction);
    if (result.needPage) {
      N.announce(document, 'Loading more of the list…');
      try {
        await loadPage(result.needPage);
      } catch (error) {
        N.announce(document, `Couldn't load more of the list: ${error.message}.`);
        return;
      }
      if (!isCurrent(key)) return;
      loc = N.locate(state.queue, route.key);
      if (!loc) return;
      result = N.step(state.queue, loc, direction);
      render(route.key);
    }
    if (result.item) {
      navigate(result.item.url);
    } else if (result.end) {
      N.announce(document, `This is the ${direction > 0 ? 'last' : 'first'} ${nounFor()} in the list.`);
    }
  }

  document.addEventListener('keydown', (event) => {
    const key = N.keyAction(event);
    if (!key || event.repeat) return;
    const target = (typeof event.composedPath === 'function' && event.composedPath()[0]) || event.target;
    if (N.isEditable(target) || !canHandle(key)) return;
    event.preventDefault();
    event.stopPropagation();
    go(key.action);
  }, true);

  // Pending controls have no URL until the next page of the list arrives.
  function activatePending(event) {
    const link = event.target instanceof Element && event.target.closest('.ghnav-bar a[data-ghnav-step]');
    if (!link || link.hasAttribute('href') || link.getAttribute('aria-disabled') === 'true') return;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    go(link.dataset.ghnavStep);
  }
  document.addEventListener('click', activatePending);
  document.addEventListener('keydown', activatePending);

  // sessionStorage isn't shared with new tabs, so leave a short-lived note
  // for an item opened from a list in another tab or window.
  function rememberListForNewTab(event) {
    const newTab = event.type === 'contextmenu'
      || (event.type === 'auxclick' && event.button === 1)
      || (event.type === 'click' && (event.ctrlKey || event.metaKey || event.shiftKey));
    if (!newTab) return;
    const link = event.target instanceof Element && event.target.closest('a[href]');
    if (!link) return;
    const target = N.parseRoute(link.href);
    if (target.kind !== 'item') return;

    const here = N.parseRoute(location.href);
    let listHref = null;
    if (here.kind === 'list' && here.repo === target.repo) {
      listHref = location.href;
    } else if (here.kind === 'item' && model) {
      const loc = N.locate(state.queue, target.key);
      if (loc) listHref = N.listPageUrl(state.listUrl, loc.page);
    }
    if (!listHref) return;
    const entries = N.addHandoff(read(localStorage, HANDOFF_KEY), { key: target.key, listUrl: listHref }, Date.now());
    write(localStorage, HANDOFF_KEY, entries);
  }
  for (const type of ['click', 'auxclick', 'contextmenu']) {
    document.addEventListener(type, rememberListForNewTab, true);
  }

  // GitHub changes pages without reloading, so watch the URL.
  setInterval(checkRoute, 250);
  window.addEventListener('popstate', () => {
    viaHistory = true;
    checkRoute();
  });
  document.addEventListener('turbo:load', checkRoute);
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    state = validState(read(sessionStorage, STATE_KEY));
    currentKey = null;
    viaHistory = true;
    checkRoute();
  });
  checkRoute();
})();
