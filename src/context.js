'use strict';

(() => {
  const { parseRoute } = typeof module === 'object' ? require('./routes.js') : globalThis.GhNav;

  const HANDOFF_MAX_AGE_MS = 2 * 60 * 1000;
  const HANDOFF_MAX_ENTRIES = 20;

  // Decides which list, if any, an item page belongs to.
  //   prevInList:  the previous page was an item in the list being stepped
  //   active:      that list's controls were showing on the previous item
  //   viaHistory:  the user got here with Back or Forward
  //   routeInList: this item is in the list being stepped
  function chooseContext({ route, prevRoute, prevInList, active, viaHistory, routeInList, handoffListUrl }) {
    if (!route || route.kind !== 'item') return { action: 'none' };

    if (prevRoute && prevRoute.kind === 'list' && prevRoute.repo === route.repo) {
      return { action: 'adopt', listUrl: prevRoute.listUrl, page: prevRoute.page };
    }
    if (prevRoute && prevRoute.kind === 'item' && prevInList && active) return { action: 'keep' };
    if (viaHistory && routeInList) return { action: 'keep' };

    const handoff = handoffListUrl ? parseRoute(handoffListUrl) : null;
    if (handoff && handoff.kind === 'list' && handoff.repo === route.repo) {
      return { action: 'adopt', listUrl: handoff.listUrl, page: handoff.page };
    }
    return { action: 'none' };
  }

  function pruneHandoffs(entries, now) {
    return (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry && typeof entry.key === 'string' && typeof entry.listUrl === 'string' && now - entry.at <= HANDOFF_MAX_AGE_MS)
      .slice(-HANDOFF_MAX_ENTRIES);
  }

  function addHandoff(entries, { key, listUrl }, now) {
    const kept = pruneHandoffs(entries, now).filter((entry) => entry.key !== key);
    return pruneHandoffs([...kept, { key, listUrl, at: now }], now);
  }

  function takeHandoff(entries, key, now) {
    const fresh = pruneHandoffs(entries, now);
    const match = fresh.find((entry) => entry.key === key);
    return {
      listUrl: match ? match.listUrl : null,
      entries: fresh.filter((entry) => entry !== match),
    };
  }

  const api = { chooseContext, addHandoff, takeHandoff, pruneHandoffs, HANDOFF_MAX_AGE_MS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.GhNav = Object.assign(globalThis.GhNav || {}, api);
})();
