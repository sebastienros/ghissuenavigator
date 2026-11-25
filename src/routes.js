'use strict';

(() => {
  const LIST_PATH = /^\/([^/]+)\/([^/]+)\/(issues|pulls)\/?$/;
  const ITEM_PATH = /^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)(?:\/.*)?$/;
  const RESERVED_OWNERS = new Set([
    'account', 'dashboard', 'enterprises', 'marketplace', 'organizations',
    'orgs', 'settings', 'sponsors', 'teams', 'users',
  ]);

  function parseRoute(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return { kind: 'other' };
    }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return { kind: 'other' };

    const list = url.pathname.match(LIST_PATH);
    if (list) {
      if (RESERVED_OWNERS.has(list[1].toLowerCase())) return { kind: 'other' };
      const params = new URLSearchParams(url.search);
      const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
      params.delete('page');
      const query = params.toString();
      return {
        kind: 'list',
        repo: `${list[1]}/${list[2]}`.toLowerCase(),
        type: list[3],
        listUrl: `${url.origin}/${list[1]}/${list[2]}/${list[3]}${query ? `?${query}` : ''}`,
        page,
      };
    }

    const item = url.pathname.match(ITEM_PATH);
    if (item) {
      if (RESERVED_OWNERS.has(item[1].toLowerCase())) return { kind: 'other' };
      const repo = `${item[1]}/${item[2]}`.toLowerCase();
      const number = Number(item[4]);
      if (!Number.isSafeInteger(number) || number < 1) return { kind: 'other' };
      return { kind: 'item', repo, number, key: `${repo}#${number}` };
    }

    return { kind: 'other' };
  }

  function listPageUrl(listUrl, page) {
    const url = new URL(listUrl);
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');
    return url.href;
  }

  const api = { parseRoute, listPageUrl };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.GhNav = Object.assign(globalThis.GhNav || {}, api);
})();
