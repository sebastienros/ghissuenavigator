'use strict';

(() => {
  // Lists this short are loaded in full, so the order can't shift while stepping.
  const FULL_LOAD_MAX_PAGES = 4;
  const MAX_PAGE_SIZE = 100;

  function createQueue(listUrl) {
    return { listUrl, pages: {}, totalPages: null, totalCount: null, pageSize: null };
  }

  function addPage(queue, data) {
    const pages = { ...queue.pages, [data.page]: data.items };
    let totalPages = data.totalPages ?? queue.totalPages;
    let totalCount = data.totalCount ?? queue.totalCount;
    if (!data.items.length) {
      if (data.page > 1) totalPages = Math.min(totalPages ?? data.page - 1, data.page - 1);
      else {
        totalPages = 1;
        totalCount = 0;
      }
    }

    let pageSize = queue.pageSize;
    if (data.totalPages && data.page < data.totalPages && data.items.length) {
      pageSize = data.items.length;
    } else if (!pageSize && data.totalPages > 1 && data.page === data.totalPages && data.totalCount !== null) {
      // GitHub stops at a page limit but still reports the full count, so check the result is plausible.
      const size = (data.totalCount - data.items.length) / (data.totalPages - 1);
      if (Number.isInteger(size) && size > 0 && size <= MAX_PAGE_SIZE) pageSize = size;
    }
    return { ...queue, pages, totalPages, totalCount, pageSize };
  }

  function locate(queue, key) {
    const pageNumbers = Object.keys(queue.pages).map(Number).sort((a, b) => a - b);
    for (const page of pageNumbers) {
      const index = queue.pages[page].findIndex((item) => item.key === key);
      if (index >= 0) return { page, index };
    }
    return null;
  }

  function positionOf(queue, loc) {
    if (loc.page === 1) return loc.index + 1;
    return queue.pageSize ? (loc.page - 1) * queue.pageSize + loc.index + 1 : null;
  }

  function step(queue, loc, direction) {
    const current = queue.pages[loc.page][loc.index];
    let page = loc.page;
    let index = loc.index + direction;

    for (;;) {
      const items = queue.pages[page];
      if (index >= 0 && index < items.length) {
        // A list that changed between page loads can repeat items on a later
        // page. Only an item's first copy counts, so Next and Previous stay
        // exact opposites and can't bounce between two items.
        const candidate = items[index];
        const first = locate(queue, candidate.key);
        if (candidate.key !== current.key && first.page === page && first.index === index) {
          return { item: candidate, loc: { page, index } };
        }
        index += direction;
        continue;
      }
      page += direction;
      if (page < 1) return { end: true };
      if (!queue.pages[page]) {
        return queue.totalPages && page > queue.totalPages ? { end: true } : { needPage: page };
      }
      index = direction > 0 ? 0 : queue.pages[page].length - 1;
    }
  }

  function missingPagesAround(queue, page) {
    const total = queue.totalPages || page;
    const wanted = total <= FULL_LOAD_MAX_PAGES
      ? Array.from({ length: total }, (_, i) => i + 1)
      : [page + 1, page - 1];
    return wanted.filter((n) => n >= 1 && n <= total && !queue.pages[n]);
  }

  const api = { createQueue, addPage, locate, positionOf, step, missingPagesAround };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.GhNav = Object.assign(globalThis.GhNav || {}, api);
})();
