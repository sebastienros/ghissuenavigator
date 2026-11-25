'use strict';

(() => {
  const STATE_KEY = 'ghnav:state';
  const PREV_KEY = 'ghnav:prev';
  const EXPECT_KEY = 'ghnav:expect';
  const HANDOFF_KEY = 'ghnav:handoff';
  const LEGACY_KEY = 'github-navigator-issues';
  const FLOATING_DELAY_MS = 4000;
  const FRESH_QUEUE_MS = 2000;
  const MAX_STEP_PAGE_HOPS = 3;
  const FATAL_STATUSES = new Set([401, 403, 404, 429]);

  function startNavigator(env) {
    const {
      N, document, window, location, sessionStorage, localStorage,
      performance, fetch, MutationObserver, Element,
      setInterval, setTimeout, clearTimeout, requestAnimationFrame,
    } = env;

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

    function validItem(item) {
      if (!item || typeof item.key !== 'string' || !Number.isSafeInteger(item.number) || item.number < 1) return false;
      if (typeof item.url !== 'string') return false;
      const route = N.parseRoute(item.url);
      return route.kind === 'item' && route.key === item.key && route.number === item.number;
    }

    function validState(value) {
      if (!value || typeof value.listUrl !== 'string' || N.parseRoute(value.listUrl).kind !== 'list') return null;
      const pages = value.queue && value.queue.pages;
      if (!pages || typeof pages !== 'object' || Array.isArray(pages)) return null;
      for (const [pageKey, items] of Object.entries(pages)) {
        const pageNum = Number(pageKey);
        if (!Number.isSafeInteger(pageNum) || pageNum < 1 || !Array.isArray(items) || !items.every(validItem)) {
          return null;
        }
      }
      return value;
    }

    write(localStorage, LEGACY_KEY, null);
    const storedHandoffs = N.pruneHandoffs(read(localStorage, HANDOFF_KEY), Date.now());
    write(localStorage, HANDOFF_KEY, storedHandoffs.length ? storedHandoffs : null);

    // { listUrl, queue, active, startPage, fetchedAt }: the list this tab is stepping through.
    let state = validState(read(sessionStorage, STATE_KEY));
    let currentKey = null;
    let routeStartedAt = 0;
    let model = null;
    let floatingTimer = null;
    let viaHistory = false;
    let firstRoute = true;
    let navToken = 0;
    let routeChain = Promise.resolve();
    let lastAction = Promise.resolve();
    const inflight = new Map();

    const hrefKey = (href) => {
      try {
        const url = new URL(href);
        return url.origin + url.pathname + url.search;
      } catch {
        return null;
      }
    };
    const isCurrent = (key) => hrefKey(location.href) === key;
    const nounFor = () => (/\/pull\/\d+/.test(location.pathname) ? 'pull request' : 'issue');
    const inList = (key) => Boolean(state && N.locate(state.queue, key));
    const eventTarget = (event) => (typeof event.composedPath === 'function' && event.composedPath()[0]) || event.target;

    function saveState() {
      write(sessionStorage, STATE_KEY, state);
    }

    function syncCurrentListHref() {
      const key = hrefKey(location.href);
      if (key && key !== currentKey && N.parseRoute(location.href).kind === 'list') {
        currentKey = key;
        write(sessionStorage, PREV_KEY, location.href);
      }
    }

    async function fetchListPage(listUrl, page) {
      const url = N.listPageUrl(listUrl, page);
      let lastStatus = null;
      for (const accept of ['application/json', 'text/html']) {
        const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: accept } });
        if (response.redirected && /\/(login|session|sso)\b/.test(new URL(response.url).pathname)) {
          throw new Error('sign in to GitHub to step through this list');
        }
        if (!response.ok) {
          if (FATAL_STATUSES.has(response.status)) throw new Error(`GitHub returned ${response.status} for the list`);
          lastStatus = response.status;
          continue;
        }
        const data = N.parseListResponse(await response.text());
        if (data) return data;
      }
      if (lastStatus !== null) throw new Error(`GitHub returned ${lastStatus} for the list`);
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
              state.fetchedAt = Date.now();
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
      const expected = read(sessionStorage, EXPECT_KEY);
      write(sessionStorage, EXPECT_KEY, null);
      if (!firstRoute) return stored;
      firstRoute = false;
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (nav && nav.type === 'back_forward') viaHistory = true;
      if (expected && expected === hrefKey(location.href)) return stored;
      const fromGitHub = document.referrer === 'https://github.com' || document.referrer.startsWith('https://github.com/');
      return nav && nav.type === 'navigate' && !fromGitHub ? null : stored;
    }

    function navigate(url) {
      const kind = N.parseRoute(url).kind;
      if (kind !== 'item' && kind !== 'list') return;
      write(sessionStorage, PREV_KEY, location.href);
      write(sessionStorage, EXPECT_KEY, hrefKey(url));
      location.assign(url);
    }

    async function onRoute() {
      const key = hrefKey(location.href);
      if (!key || key === currentKey) {
        viaHistory = false;
        return;
      }
      navToken++;
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

      const sameActiveItem = Boolean(state && state.active && prevRoute && prevRoute.kind === 'item' && prevRoute.key === route.key);
      const decision = N.chooseContext({
        route,
        prevRoute,
        prevInList: Boolean((prevRoute && prevRoute.kind === 'item' && inList(prevRoute.key)) || sameActiveItem),
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
        const canReuse = state && state.listUrl === decision.listUrl
          && state.queue.pages[decision.page]
          && state.fetchedAt && Date.now() - state.fetchedAt < FRESH_QUEUE_MS;
        if (!canReuse) {
          state = { listUrl: decision.listUrl, queue: N.createQueue(decision.listUrl), active: true, startPage: decision.page };
          saveState();
          try {
            await loadPage(decision.page);
          } catch (error) {
            console.warn('GitHub Issues Navigator:', error.message);
            return;
          }
        } else if (!state.active) {
          state.active = true;
          saveState();
        }
      } else {
        if (!state.active) {
          state.active = true;
          saveState();
        }
        if (Object.keys(state.queue.pages).length === 0 && state.startPage) {
          try {
            await loadPage(state.startPage);
          } catch (error) {
            console.warn('GitHub Issues Navigator:', error.message);
            return;
          }
        }
      }
      if (!isCurrent(key)) return;
      render(route.key);
      await fillAround(route.key, key, decision.page || (state && state.startPage) || 1);
      if (isCurrent(key) && state && state.active && !N.locate(state.queue, route.key)) {
        state.active = false;
        saveState();
      }
    }

    function checkRoute() {
      routeChain = routeChain
        .then(() => onRoute())
        .catch((error) => console.warn('GitHub Issues Navigator:', error));
      return routeChain;
    }

    function canHandle({ action, alias }) {
      const route = N.parseRoute(location.href);
      // On a list, Alt+arrows stay the browser's Back and Forward.
      if (route.kind === 'list') return !alias && action !== 'list';
      return route.kind === 'item' && Boolean(model);
    }

    async function startFromList(route, action) {
      const token = ++navToken;
      syncCurrentListHref();
      const key = hrefKey(location.href);
      state = { listUrl: route.listUrl, queue: N.createQueue(route.listUrl), active: true, startPage: route.page };
      saveState();
      try {
        await loadPage(route.page);
      } catch (error) {
        N.announce(document, `Couldn't load this list: ${error.message}.`);
        return;
      }
      if (token !== navToken || !isCurrent(key)) return;
      const items = state.queue.pages[route.page] || [];
      if (!items.length) {
        N.announce(document, 'There is nothing in this list to step through.');
        return;
      }
      navigate((action === 'next' ? items[0] : items[items.length - 1]).url);
    }

    async function go(action) {
      syncCurrentListHref();
      const key = hrefKey(location.href);
      const route = N.parseRoute(location.href);
      if (route.kind === 'list') return startFromList(route, action);
      if (route.kind !== 'item' || !state) return;

      const token = ++navToken;
      let loc = N.locate(state.queue, route.key);
      if (!loc) return;
      if (action === 'list') {
        navigate(N.listPageUrl(state.listUrl, loc.page));
        return;
      }

      const direction = action === 'next' ? 1 : -1;
      let result = N.step(state.queue, loc, direction);
      let hops = 0;
      while (result.needPage && hops < MAX_STEP_PAGE_HOPS) {
        hops++;
        if (hops === 1) N.announce(document, 'Loading more of the list…');
        try {
          await loadPage(result.needPage);
        } catch (error) {
          if (token === navToken && isCurrent(key)) {
            N.announce(document, `Couldn't load more of the list: ${error.message}.`);
          }
          return;
        }
        if (token !== navToken || !isCurrent(key)) return;
        loc = N.locate(state.queue, route.key);
        if (!loc) return;
        result = N.step(state.queue, loc, direction);
        render(route.key);
      }
      if (token !== navToken || !isCurrent(key)) return;
      if (result.item) {
        navigate(result.item.url);
      } else if (result.end) {
        N.announce(document, `This is the ${direction > 0 ? 'last' : 'first'} ${nounFor()} in the list.`);
      }
    }

    function runAction(action) {
      lastAction = go(action).catch((error) => console.warn('GitHub Issues Navigator:', error));
      return lastAction;
    }

    document.addEventListener('keydown', (event) => {
      const key = N.keyAction(event);
      if (!key || event.repeat) return;
      const target = eventTarget(event);
      if (N.isEditable(target) || !canHandle(key)) return;
      event.preventDefault();
      event.stopPropagation();
      runAction(key.action);
    }, true);

    // Pending controls have no URL until the next page of the list arrives.
    function activatePending(event) {
      const target = eventTarget(event);
      const link = target instanceof Element && target.closest('.ghnav-bar a[data-ghnav-step]');
      if (!link || link.hasAttribute('href') || link.getAttribute('aria-disabled') === 'true') return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      runAction(link.dataset.ghnavStep);
    }
    document.addEventListener('click', activatePending);
    document.addEventListener('keydown', activatePending);

    // Record list URL updates before SPA handlers run, mark self-initiated bar
    // clicks, and hand off the list to items opened in a new tab or window.
    function onPointerLink(event) {
      syncCurrentListHref();
      const targetEl = eventTarget(event);
      const link = targetEl instanceof Element && targetEl.closest('a[href]');
      if (!link) return;

      if (event.type === 'click' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && (event.button ?? 0) === 0) {
        if (link.closest('.ghnav-bar')) {
          const kind = N.parseRoute(link.href).kind;
          if (kind === 'item' || kind === 'list') {
            write(sessionStorage, PREV_KEY, location.href);
            write(sessionStorage, EXPECT_KEY, hrefKey(link.href));
          }
        }
        return;
      }

      const newTab = event.type === 'contextmenu'
        || (event.type === 'auxclick' && event.button === 1)
        || (event.type === 'click' && (event.ctrlKey || event.metaKey || event.shiftKey));
      if (!newTab) return;
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
      document.addEventListener(type, onPointerLink, true);
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

    return {
      checkRoute,
      flush: () => Promise.all([routeChain, lastAction]),
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { startNavigator };
  } else if (globalThis.GhNav && !globalThis.GhNav.running) {
    globalThis.GhNav.running = true;
    startNavigator({
      N: globalThis.GhNav,
      document,
      window,
      location,
      sessionStorage,
      localStorage,
      performance,
      fetch: fetch.bind(globalThis),
      MutationObserver,
      Element,
      setInterval: setInterval.bind(globalThis),
      setTimeout: setTimeout.bind(globalThis),
      clearTimeout: clearTimeout.bind(globalThis),
      requestAnimationFrame: requestAnimationFrame.bind(globalThis),
    });
  }
})();
