'use strict';

// Fictional data shaped like the JSON GitHub's list pages return.

function issueResult(number, repo = 'octo-org/sample-repo') {
  return {
    id: `I_${number}`,
    itemType: 'REPO_ISSUES_DASHBOARD_ITEM_TYPE_ISSUE',
    issue: {
      number,
      title: `Example issue ${number}`,
      state: 'REPO_ISSUE_STATE_OPEN',
      permalink: `https://github.com/${repo}/issues/${number}`,
      repoNameWithOwner: repo,
    },
  };
}

function issuesPayload(numbers, { page = 1, totalPages = 1, totalCount = numbers.length } = {}) {
  return {
    meta: { title: 'Issues · octo-org/sample-repo' },
    payload: {
      issuesIndexContentRoute: {
        results: numbers.map((n) => issueResult(n)),
        pageInfo: { currentPage: page, totalPages, totalCount },
      },
      issuesLayoutRoute: {
        pinnedIssues: { issues: [issueResult(999)] },
      },
    },
  };
}

function pullsPayload(numbers, { page = 1, totalPages = 1, totalCount = numbers.length } = {}) {
  return {
    payload: {
      repoPullsDashboardContentRoute: {
        results: numbers.map((number) => ({
          number,
          title: `Example pull request ${number}`,
          permalink: `https://github.com/octo-org/sample-repo/pull/${number}`,
          repoNameWithOwner: 'octo-org/sample-repo',
        })),
        currentPage: page,
        totalPages,
        totalCount,
      },
    },
  };
}

function htmlWithEmbedded(json) {
  return `<!DOCTYPE html><html><body>
<script type="application/json" data-target="react-partial.embeddedData">{"props":{}}</script>
<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(json)}</script>
</body></html>`;
}

module.exports = { issuesPayload, pullsPayload, htmlWithEmbedded };
