'use strict';

(() => {
  const { parseRoute } = typeof module === 'object' ? require('./routes.js') : globalThis.GhNav;

  const EMBEDDED_DATA = /<script\b[^>]*\bdata-target=["']react-app\.embeddedData["'][^>]*>([\s\S]*?)<\/script>/gi;

  // GitHub's list pages keep their results in a "...ContentRoute" object
  // (issuesIndexContentRoute, repoPullsDashboardContentRoute). An empty list
  // has no results array, only its page details.
  function findResultsRoute(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const route = Object.entries(payload).find(([name, value]) => /ContentRoute$/.test(name)
      && value && typeof value === 'object'
      && (Array.isArray(value.results) || value.pageInfo || 'currentPage' in value));
    return route ? route[1] : null;
  }

  function toItem(result) {
    const node = result && (result.issue || result.pullRequest || result);
    if (!node || !Number.isInteger(node.number) || typeof node.permalink !== 'string') return null;
    let url;
    try {
      url = new URL(node.permalink, 'https://github.com');
    } catch {
      return null;
    }
    const route = parseRoute(url.href);
    if (route.kind !== 'item') return null;
    return { key: route.key, number: node.number, url: `${url.origin}${url.pathname}` };
  }

  function toCount(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }

  function extractRoute(text) {
    const trimmed = text.trimStart();
    if (trimmed.startsWith('{')) {
      try {
        return findResultsRoute(JSON.parse(trimmed).payload);
      } catch {
        return null;
      }
    }
    for (const match of text.matchAll(EMBEDDED_DATA)) {
      try {
        const route = findResultsRoute(JSON.parse(match[1]).payload);
        if (route) return route;
      } catch {
        // Keep checking any remaining embedded data blocks.
      }
    }
    return null;
  }

  function parseListResponse(text) {
    const route = extractRoute(String(text));
    if (!route) return null;

    const info = route.pageInfo || route;
    const items = Array.isArray(route.results) ? route.results.map(toItem).filter(Boolean) : [];
    const totalPages = toCount(info.totalPages);
    return {
      items,
      page: Math.max(1, toCount(info.currentPage) || 1),
      // GitHub leaves the counts out of empty pages; null means "unknown".
      totalPages: totalPages ? totalPages : null,
      totalCount: toCount(info.totalCount),
    };
  }

  const api = { parseListResponse };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.GhNav = Object.assign(globalThis.GhNav || {}, api);
})();
