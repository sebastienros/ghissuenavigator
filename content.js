// GitHub Issues Navigator - Content Script
// Handles keyboard navigation through issues and pull requests

class GitHubIssuesNavigator {
  constructor() {
    this.issues = [];
    this.currentIndex = -1;
    this.isNavigating = false;
    this.originalUrl = '';
    this.lastLoadTime = 0;
    this.loadThrottleDelay = 2000; // Only reload issues every 2 seconds max
    this.initialized = false;
    this.storageKey = 'github-navigator-issues';
    this.hasMorePages = true;
    this.currentPage = 1;
    this.pageSize = 25; // GitHub's default page size
    this.isLoadingMore = false;
    
    this.init();
  }

  async init() {
    // Always set up keyboard listeners and page observer for URL changes
    this.setupKeyboardListeners();
    this.setupPageObserver();
    
    // Only activate navigation features on list pages
    if (this.isOnListPage()) {
      if (!this.initialized) {
        console.log('GitHub Navigator: Initializing on issues/pulls list page');
        this.initialized = true;
      }
      // Clear any previous navigation state since we're on a list page
      this.isNavigating = false;
      this.currentIndex = -1;
      // Clear stored issues when on list page initially
      localStorage.removeItem(this.storageKey);
      this.issues = [];
      this.hasMorePages = true;
      this.currentPage = 1;
      this.endCursor = null;
      // Show the navigation indicator with initial message
      this.createNavigationIndicator();
      this.updateIndicator(); // This will show the "Press Ctrl+→ or Ctrl+← to start navigation" message
    } else {
      if (!this.initialized) {
        console.log('GitHub Navigator: Loaded but inactive (not on a list page)');
        this.initialized = true;
      }
      // Try to load issues from storage for navigation on individual pages
      const restored = this.loadIssuesFromStorage();
      
      // If we restored navigation state, show indicator (even on individual pages when navigating)
      if (restored && this.isNavigating && this.currentIndex >= 0) {
        this.createNavigationIndicator();
        this.updateIndicator();
        console.log('GitHub Navigator: Restored navigation state on individual page', {
          currentIndex: this.currentIndex,
          currentIssue: this.issues[this.currentIndex]?.title
        });
      } else {
        // Hide indicator if we're not navigating properly
        this.hideNavigationIndicator();
        // Clear invalid navigation state
        if (this.isNavigating && this.currentIndex < 0) {
          console.log('GitHub Navigator: Clearing invalid navigation state in init');
          this.isNavigating = false;
          this.currentIndex = -1;
        }
      }
    }
  }

  saveIssuesToStorage() {
    try {
      // Don't save invalid navigation state (isNavigating true but currentIndex -1)
      const isValidNavigationState = !this.isNavigating || (this.isNavigating && this.currentIndex >= 0);
      
      if (!isValidNavigationState) {
        console.log('GitHub Navigator: Skipping save - invalid navigation state', {
          isNavigating: this.isNavigating,
          currentIndex: this.currentIndex
        });
        return;
      }

      const issuesData = {
        issues: this.issues,
        originalUrl: this.originalUrl || window.location.href,
        timestamp: Date.now(),
        repoPath: this.getRepoPath(),
        isNavigating: this.isNavigating,
        currentIndex: this.currentIndex,
        hasMorePages: this.hasMorePages,
        currentPage: this.currentPage,
        searchQuery: this.getSearchQuery(),
        endCursor: this.endCursor
      };
      localStorage.setItem(this.storageKey, JSON.stringify(issuesData));
      console.log(`GitHub Navigator: Saved ${this.issues.length} issues to storage`);
      console.log('GitHub Navigator: Saved state:', {
        issuesCount: this.issues.length,
        isNavigating: this.isNavigating,
        currentIndex: this.currentIndex,
        currentIssue: this.currentIndex >= 0 ? this.issues[this.currentIndex]?.title : 'None',
        hasMorePages: this.hasMorePages,
        currentPage: this.currentPage
      });
    } catch (error) {
      console.warn('GitHub Navigator: Failed to save issues to storage:', error);
    }
  }

  loadIssuesFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return false;

      const issuesData = JSON.parse(stored);
      const currentRepoPath = this.getRepoPath();
      const currentSearchQuery = this.getSearchQuery();
      
      // Only use stored issues if they're from the same repository, same search, and not too old (1 hour)
      const isValidRepo = issuesData.repoPath === currentRepoPath;
      
      // For search query validation:
      // - If we're on a list page, search queries must match exactly
      // - If we're on an individual issue page, we're more lenient (empty current search is OK)
      const isOnIndividualPage = !this.isOnListPage();
      const isSameSearch = isOnIndividualPage ? 
        true : // On individual pages, don't validate search query
        (issuesData.searchQuery === currentSearchQuery);
      
      const isNotExpired = (Date.now() - issuesData.timestamp) < (60 * 60 * 1000); // 1 hour
      
      console.log('GitHub Navigator: Storage validation details:', {
        stored_repoPath: issuesData.repoPath,
        current_repoPath: currentRepoPath,
        stored_searchQuery: issuesData.searchQuery,
        current_searchQuery: currentSearchQuery,
        isOnIndividualPage,
        isValidRepo,
        isSameSearch,
        isNotExpired,
        currentUrl: window.location.href
      });
      
      if (isValidRepo && isSameSearch && isNotExpired && issuesData.issues && issuesData.issues.length > 0) {
        this.issues = issuesData.issues;
        this.originalUrl = issuesData.originalUrl;
        this.hasMorePages = issuesData.hasMorePages || false;
        this.currentPage = issuesData.currentPage || 1;
        this.endCursor = issuesData.endCursor || null;
        
        // Restore navigation state if we were navigating
        if (issuesData.isNavigating && typeof issuesData.currentIndex === 'number' && issuesData.currentIndex >= 0) {
          this.isNavigating = issuesData.isNavigating;
          this.currentIndex = issuesData.currentIndex;
          console.log(`GitHub Navigator: Restored navigation state - index ${this.currentIndex}/${this.issues.length}`);
        } else if (issuesData.isNavigating && issuesData.currentIndex === -1) {
          console.log('GitHub Navigator: Found invalid currentIndex (-1) in storage, clearing navigation state');
          this.isNavigating = false;
          this.currentIndex = -1;
        }
        
        console.log(`GitHub Navigator: Loaded ${this.issues.length} issues from storage`);
        console.log('GitHub Navigator: Storage issues preview:', this.issues.slice(0, 3).map((issue, idx) => ({
          index: idx,
          title: issue.title,
          url: issue.url
        })));
        
        if (this.isNavigating) {
          console.log('GitHub Navigator: Current navigation state:', {
            currentIndex: this.currentIndex,
            currentIssue: this.issues[this.currentIndex]?.title,
            previousIssue: this.currentIndex > 0 ? this.issues[this.currentIndex - 1]?.title : 'None',
            nextIssue: this.currentIndex < this.issues.length - 1 ? this.issues[this.currentIndex + 1]?.title : 'None'
          });
        }
        
        return true;
      } else {
        console.log('GitHub Navigator: Stored issues invalid/expired, clearing storage');
        localStorage.removeItem(this.storageKey);
        return false;
      }
    } catch (error) {
      console.warn('GitHub Navigator: Failed to load issues from storage:', error);
      localStorage.removeItem(this.storageKey);
      return false;
    }
  }

  getRepoPath() {
    // Extract repository path from URL (e.g., "microsoft/vscode")
    const match = window.location.pathname.match(/^\/([^\/]+\/[^\/]+)/);
    return match ? match[1] : '';
  }

  getSearchQuery() {
    // Extract search query from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('q') || '';
  }

  isOnListPage() {
    const url = window.location.href;
    const path = window.location.pathname;
    
    // Check if we're on an issues or pulls list page (not a specific issue/PR)
    const isIssuesPath = path.endsWith('/issues') || path.endsWith('/issues/');
    const isPullsPath = path.endsWith('/pulls') || path.endsWith('/pulls/');
    
    // Make sure we're NOT on a specific issue/PR page (which has numbers at the end)
    const isNotSpecificIssue = !path.match(/\/(issues|pull)\/\d+\/?$/);
    
    // Check for query parameters that indicate a filtered list
    const hasQueryParams = url.includes('?');
    
    const result = (isIssuesPath || isPullsPath || (hasQueryParams && url.includes('/issues?')) || (hasQueryParams && url.includes('/pulls?'))) && isNotSpecificIssue;
    
    return result;
  }

  setupPageObserver() {
    // Watch for URL changes (GitHub uses client-side navigation)
    let currentUrl = window.location.href;
    
    const checkUrlChange = async () => {
      if (window.location.href !== currentUrl) {
        const previousUrl = currentUrl;
        currentUrl = window.location.href;
        console.log('GitHub Navigator: URL changed from', previousUrl, 'to', currentUrl);
        
        if (this.isOnListPage()) {
          // We're now on a list page - activate navigation and reset state
          console.log('GitHub Navigator: Activating on list page - resetting navigation state');
          // Clear any previous navigation state since we're on a new list
          this.isNavigating = false;
          this.currentIndex = -1;
          // Clear stored issues when returning to list page
          localStorage.removeItem(this.storageKey);
          this.issues = [];
          this.hasMorePages = true;
          this.currentPage = 1;
          this.endCursor = null;
          // Show the navigation indicator with initial message
          this.createNavigationIndicator();
          this.updateIndicator(); // This will show the "Press Ctrl+→ or Ctrl+← to start navigation" message
        } else {
          // We're on an individual issue/PR page - keep navigation state and show indicator if navigating
          console.log('GitHub Navigator: On individual issue/PR page - keeping navigation state');
          // Don't reset currentIndex - we want to preserve our position for continued navigation
          // Show indicator if we're currently navigating
          if (this.isNavigating && this.currentIndex >= 0) {
            this.createNavigationIndicator();
            this.updateIndicator();
          } else {
            this.hideNavigationIndicator();
          }
        }
      }
    };

    // Check for URL changes periodically
    setInterval(checkUrlChange, 1000);

    // Watch for changes in the page content (GitHub uses dynamic loading)
    const observer = new MutationObserver((mutations) => {
      // Only process if we're still on a list page
      if (!this.isOnListPage()) {
        return;
      }

      // Only reload if enough time has passed since last load
      const now = Date.now();
      if (now - this.lastLoadTime < this.loadThrottleDelay) {
        return;
      }

      // Check if the mutations actually involve issue-related content
      let hasRelevantChanges = false;
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any added nodes contain issue-related content
          Array.from(mutation.addedNodes).forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const hasIssueContent = node.querySelector && (
                node.querySelector('a[href*="/issues/"]') ||
                node.querySelector('a[href*="/pull/"]') ||
                node.classList.contains('js-navigation-item')
              );
              if (hasIssueContent) {
                hasRelevantChanges = true;
              }
            }
          });
        }
      });

      if (hasRelevantChanges) {
        console.log('Detected relevant page changes, but waiting for user interaction to reload issues...');
        // Don't automatically reload issues - wait for user interaction
      }
    });

    // Start observing with less sensitivity
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  setupKeyboardListeners() {
    document.addEventListener('keydown', async (event) => {
      // Alt+Arrow keys for navigation - work on any GitHub issues/PR page
      if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        
        if (!this.isNavigating) {
          // Start navigation from beginning or end
          if (event.key === 'ArrowRight') {
            await this.startNavigationFromBeginning();
          } else {
            await this.startNavigationFromEnd();
          }
        } else {
          // Continue navigation
          if (event.key === 'ArrowRight') {
            await this.navigateNext();
          } else {
            this.navigatePrevious();
          }
        }
      } else if (this.isNavigating && event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        this.stopNavigation();
      }
    });
  }

  async loadIssues(reset = true) {
    // Throttle loading to prevent excessive calls
    const now = Date.now();
    if (now - this.lastLoadTime < this.loadThrottleDelay) {
      return;
    }
    this.lastLoadTime = now;

    if (reset) {
      this.issues = [];
      this.currentPage = 1;
      this.hasMorePages = true;
    }

    await this.loadIssuesFromGraphQL();
  }

  async loadIssuesFromGraphQL() {
    if (this.isLoadingMore) return;
    this.isLoadingMore = true;

    try {
      const repoPath = this.getRepoPath();
      if (!repoPath) {
        throw new Error('Unable to determine repository path');
      }

      const searchQuery = this.getSearchQuery();
      
      // Use the search query directly if available, otherwise construct a basic one
      let query;
      if (searchQuery) {
        // Use the existing search query from URL - it's already in the correct format
        query = searchQuery;
      } else {
        // Fallback: construct a basic query for the current repository
        const [owner, name] = repoPath.split('/');
        
        // Determine if we're on issues or pulls page
        const isOnPullsPage = window.location.pathname.includes('/pulls');
        const type = isOnPullsPage ? 'is:pull-request' : 'is:issue';
        
        query = `repo:${owner}/${name} ${type} state:open sort:created-desc`;
      }

      console.log('GitHub Navigator: Searching with query:', query);
      console.log('GitHub Navigator: GraphQL variables:', {
        query: query,
        first: this.pageSize,
        after: this.getEndCursor(),
        currentPage: this.currentPage,
        endCursor: this.endCursor
      });

      // Extract queryId from embedded data on the page
      const queryId = this.extractQueryIdFromPage();
      if (!queryId) {
        throw new Error('Unable to find GraphQL queryId in page data');
      }

      // Prepare GraphQL query payload following the expected format
      const [owner, name] = repoPath.split('/');
      const skip = (this.currentPage - 1) * this.pageSize; // Calculate skip based on current page
      
      const graphqlPayload = {
        query: queryId,
        variables: {
          includeReactions: false,
          name: name,
          owner: owner,
          query: query,
          skip: skip
        }
      };

      // URL encode the payload for the query parameter
      const encodedBody = encodeURIComponent(JSON.stringify(graphqlPayload));
      
      const graphqlUrl = `https://github.com/_graphql?body=${encodedBody}`;

      // Make the GraphQL request using GET
      const response = await fetch(graphqlUrl, {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      // Handle the new GraphQL response format
      const searchResult = data.data.repository.search;
      const newIssues = searchResult.edges.map(edge => ({
        url: edge.node.__isIssueOrPullRequest === 'Issue' ? 
          `https://github.com/${owner}/${name}/issues/${edge.node.number}` :
          `https://github.com/${owner}/${name}/pull/${edge.node.number}`,
        title: edge.node.title,
        number: edge.node.number,
        state: edge.node.state,
        labels: edge.node.labels.edges.map(labelEdge => labelEdge.node?.name || '').filter(Boolean)
      }));

      if (this.currentPage === 1) {
        this.issues = newIssues;
      } else {
        this.issues.push(...newIssues);
      }

      this.hasMorePages = searchResult.pageInfo.hasNextPage;
      this.endCursor = searchResult.pageInfo.endCursor;
      this.endCursor = searchResult.pageInfo.endCursor;

      console.log(`GitHub Navigator: Loaded ${newIssues.length} issues via GraphQL (page ${this.currentPage}, total: ${this.issues.length})`);
      console.log('GitHub Navigator: GraphQL issues preview:', newIssues.slice(0, 3).map((issue, idx) => ({
        index: this.currentPage === 1 ? idx : this.issues.length - newIssues.length + idx,
        title: issue.title,
        url: issue.url
      })));
      
      // Save to storage when we have issues
      if (this.issues.length > 0) {
        this.saveIssuesToStorage();
      }

    } finally {
      this.isLoadingMore = false;
    }
  }

  getEndCursor() {
    // Only return endCursor for pagination (page 2+), null for first page
    return this.currentPage > 1 ? this.endCursor : null;
  }

  extractQueryIdFromPage() {
    try {
      // Look for the embedded data script tag
      const scriptTag = document.querySelector('script[data-target="react-app.embeddedData"]');
      if (!scriptTag) {
        console.warn('GitHub Navigator: Could not find embedded data script tag');
        return null;
      }

      const embeddedData = JSON.parse(scriptTag.textContent);
      const preloadedQueries = embeddedData.payload?.preloadedQueries;
      
      if (!preloadedQueries || !Array.isArray(preloadedQueries)) {
        console.warn('GitHub Navigator: No preloadedQueries found in embedded data');
        return null;
      }

      // Look for the IssueIndexPageQuery
      const issueQuery = preloadedQueries.find(query => 
        query.queryName === 'IssueIndexPageQuery' || 
        query.queryName === 'PullRequestIndexPageQuery' ||
        query.queryId // Fallback to any query with a queryId
      );

      if (!issueQuery || !issueQuery.queryId) {
        console.warn('GitHub Navigator: Could not find queryId in preloaded queries');
        return null;
      }

      console.log('GitHub Navigator: Extracted queryId:', issueQuery.queryId);
      return issueQuery.queryId;
    } catch (error) {
      console.warn('GitHub Navigator: Error extracting queryId from page:', error);
      return null;
    }
  }

  async loadMoreIssues() {
    if (!this.hasMorePages || this.isLoadingMore) {
      console.log('GitHub Navigator: Cannot load more issues -', {
        hasMorePages: this.hasMorePages,
        isLoadingMore: this.isLoadingMore
      });
      return false;
    }

    console.log(`GitHub Navigator: Loading more issues - page ${this.currentPage + 1}, current issues: ${this.issues.length}`);
    this.currentPage++;
    
    try {
      await this.loadIssuesFromGraphQL();
      console.log(`GitHub Navigator: Successfully loaded more issues - total now: ${this.issues.length}`);
      return this.issues.length > 0;
    } catch (error) {
      console.warn('GitHub Navigator: Failed to load more issues:', error);
      this.currentPage--; // Revert page increment on failure
      return false;
    }
  }

  createNavigationIndicator() {
    // Don't create if it already exists
    if (document.getElementById('github-nav-indicator')) {
      return;
    }
    
    // Create a floating indicator to show navigation status
    const indicator = document.createElement('div');
    indicator.id = 'github-nav-indicator';
    indicator.innerHTML = `
      <div class="nav-content">
        <span class="nav-title">GitHub Navigator</span>
        <span class="nav-status">Press Alt+→ or Alt+← to start navigation</span>
        <span class="nav-counter"></span>
        <button class="nav-close" title="Close indicator">×</button>
      </div>
    `;
    
    // Add click handler for close button
    const closeButton = indicator.querySelector('.nav-close');
    closeButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideNavigationIndicator();
    });
    
    document.body.appendChild(indicator);
    
    // Auto-hide after 3 seconds (but only if not actively navigating)
    setTimeout(() => {
      // Only auto-hide if we're not currently navigating
      if (!this.isNavigating) {
        this.hideNavigationIndicator();
      }
    }, 3000);
  }

  hideNavigationIndicator() {
    const indicator = document.getElementById('github-nav-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  updateIndicator() {
    const indicator = document.getElementById('github-nav-indicator');
    if (!indicator) {
      // Create indicator if it doesn't exist and we're navigating
      if (this.isNavigating) {
        this.createNavigationIndicator();
        // Try again after creating
        const newIndicator = document.getElementById('github-nav-indicator');
        if (newIndicator) {
          this.updateIndicatorContent(newIndicator);
        }
      }
      return;
    }
    
    this.updateIndicatorContent(indicator);
  }

  updateIndicatorContent(indicator) {
    const status = indicator.querySelector('.nav-status');
    const counter = indicator.querySelector('.nav-counter');
    
    if (!status || !counter) {
      console.warn('GitHub Navigator: Indicator elements not found');
      return;
    }
    
    if (this.isNavigating) {
      status.textContent = 'Navigating • Alt+← Alt+→ • Alt+↑ to exit';
      
      // Show pagination info in counter
      let counterText = `${this.currentIndex + 1}/${this.issues.length}`;
      if (this.hasMorePages) {
        counterText += ' (+more)';
      }
      counter.textContent = counterText;
      indicator.classList.add('active');
    } else {
      status.textContent = 'Press Alt+→ or Alt+← to start navigation';
      counter.textContent = '';
      indicator.classList.remove('active');
    }
  }

  async startNavigationFromBeginning() {
    console.log('GitHub Navigator: startNavigationFromBeginning() called', {
      isNavigating: this.isNavigating,
      issuesCount: this.issues.length,
      currentIndex: this.currentIndex
    });

    // If we're already navigating, just reset to first issue
    if (this.isNavigating && this.issues.length > 0) {
      this.currentIndex = 0;
      console.log('GitHub Navigator: Resetting to first issue', {
        issue: this.issues[0]?.title,
        url: this.issues[0]?.url
      });
      this.updateIndicator();
      this.navigateToIssue(0);
      this.showNotification(`Reset to first issue (1/${this.issues.length})`);
      return;
    }

    // Try to load issues from storage if we don't have any
    if (this.issues.length === 0) {
      console.log('GitHub Navigator: No issues in memory, trying to load from storage...');
      const restored = this.loadIssuesFromStorage();
      
      // If we didn't restore from storage or storage was invalid, load fresh issues
      if (!restored && this.isOnListPage()) {
        console.log('GitHub Navigator: Loading issues for first time via GraphQL...');
        await this.loadIssues();
      }
    }
    
    // If still no issues and we're on a list page, try to load them
    if (this.issues.length === 0 && this.isOnListPage()) {
      console.log('GitHub Navigator: No issues found, loading via GraphQL...');
      await this.loadIssues();
    }
    
    if (this.issues.length === 0) {
      this.showNotification('No issues found. Please visit an issues list page first to load the issue list.');
      return;
    }

    this.isNavigating = true;
    if (!this.originalUrl) {
      this.originalUrl = this.issues.length > 0 ? this.getOriginalListUrl() : window.location.href;
    }
    this.currentIndex = 0;
    
    // Save state immediately after setting navigation state
    this.saveIssuesToStorage();
    
    console.log('GitHub Navigator: Starting navigation at first issue', {
      issue: this.issues[0]?.title,
      url: this.issues[0]?.url,
      totalIssues: this.issues.length,
      nextIssue: this.issues.length > 1 ? this.issues[1]?.title : 'None'
    });
    
    // Ensure indicator exists before updating
    this.createNavigationIndicator();
    this.updateIndicator();
    this.navigateToIssue(0);
    this.showNotification(`Started at first issue (1/${this.issues.length})`);
  }

  async startNavigationFromEnd() {
    console.log('GitHub Navigator: startNavigationFromEnd() called', {
      isNavigating: this.isNavigating,
      issuesCount: this.issues.length,
      currentIndex: this.currentIndex
    });

    // If we're already navigating, just reset to last issue
    if (this.isNavigating && this.issues.length > 0) {
      this.currentIndex = this.issues.length - 1;
      console.log('GitHub Navigator: Resetting to last issue', {
        issue: this.issues[this.currentIndex]?.title,
        url: this.issues[this.currentIndex]?.url
      });
      this.updateIndicator();
      this.navigateToIssue(this.currentIndex);
      this.showNotification(`Reset to last issue (${this.issues.length}/${this.issues.length})`);
      return;
    }

    // Try to load issues from storage if we don't have any
    if (this.issues.length === 0) {
      console.log('GitHub Navigator: No issues in memory, trying to load from storage...');
      const restored = this.loadIssuesFromStorage();
      
      // If we didn't restore from storage or storage was invalid, load fresh issues
      if (!restored && this.isOnListPage()) {
        console.log('GitHub Navigator: Loading issues for first time via GraphQL...');
        await this.loadIssues();
      }
    }
    
    // If still no issues and we're on a list page, try to load them
    if (this.issues.length === 0 && this.isOnListPage()) {
      console.log('GitHub Navigator: No issues found, loading via GraphQL...');
      await this.loadIssues();
    }
    
    if (this.issues.length === 0) {
      this.showNotification('No issues found. Please visit an issues list page first to load the issue list.');
      return;
    }

    this.isNavigating = true;
    if (!this.originalUrl) {
      this.originalUrl = this.issues.length > 0 ? this.getOriginalListUrl() : window.location.href;
    }
    this.currentIndex = this.issues.length - 1;
    
    // Save state immediately after setting navigation state
    this.saveIssuesToStorage();
    
    console.log('GitHub Navigator: Starting navigation at last issue', {
      issue: this.issues[this.currentIndex]?.title,
      url: this.issues[this.currentIndex]?.url,
      totalIssues: this.issues.length,
      previousIssue: this.issues.length > 1 ? this.issues[this.currentIndex - 1]?.title : 'None'
    });
    
    // Ensure indicator exists before updating
    this.createNavigationIndicator();
    this.updateIndicator();
    this.navigateToIssue(this.currentIndex);
    this.showNotification(`Started at last issue (${this.issues.length}/${this.issues.length})`);
  }

  getOriginalListUrl() {
    // Try to construct the original list URL from the current issue URL
    const currentUrl = window.location.href;
    const match = currentUrl.match(/(https:\/\/github\.com\/[^\/]+\/[^\/]+)\/(issues|pull)\/\d+/);
    if (match) {
      const baseUrl = `${match[1]}/${match[2] === 'pull' ? 'pulls' : 'issues'}`;
      
      // If we have a stored original URL with query parameters, try to preserve them
      if (this.originalUrl && this.originalUrl.includes('?')) {
        const originalUrlObj = new URL(this.originalUrl);
        if (originalUrlObj.search) {
          return baseUrl + originalUrlObj.search;
        }
      }
      
      return baseUrl;
    }
    
    // Fallback to stored original URL or current URL
    return this.originalUrl || currentUrl;
  }

  stopNavigation() {
    this.isNavigating = false;
    this.currentIndex = -1;
    this.updateIndicator();
    
    // Return to the issues list page with current filter
    const currentListUrl = this.getOriginalListUrl();
    if (window.location.href !== currentListUrl) {
      this.navigateWithTransition(currentListUrl);
    }
    
    this.showNotification('Navigation stopped - returned to issues list');
  }

  async navigateNext() {
    if (!this.isNavigating) {
      return;
    }

    // Validate navigation state
    if (this.currentIndex < 0 || this.issues.length === 0) {
      console.warn('GitHub Navigator: Invalid navigation state in navigateNext', {
        currentIndex: this.currentIndex,
        issuesLength: this.issues.length,
        isNavigating: this.isNavigating
      });
      this.showNotification('Invalid navigation state. Please restart navigation.');
      this.isNavigating = false;
      this.currentIndex = -1;
      this.updateIndicator();
      return;
    }

    console.log('GitHub Navigator: navigateNext() called', {
      currentIndex: this.currentIndex,
      totalIssues: this.issues.length,
      hasMorePages: this.hasMorePages,
      currentIssue: this.issues[this.currentIndex]?.title
    });

    // Check if we're at the last issue
    if (this.currentIndex >= this.issues.length - 1) {
      if (this.hasMorePages) {
        this.showNotification('Loading more issues...');
        const loaded = await this.loadMoreIssues();
        if (!loaded) {
          // No more issues available, wrap to first issue
          console.log('GitHub Navigator: At last issue, wrapping to first issue...');
          this.currentIndex = 0;
          console.log('GitHub Navigator: Wrapped to first issue', {
            newIndex: this.currentIndex,
            newIssue: this.issues[this.currentIndex]?.title
          });
          
          // Save state before navigating
          this.saveIssuesToStorage();
          this.navigateToIssue(this.currentIndex);
          this.showNotification(`Wrapped to first issue (1/${this.issues.length})`);
          return;
        }
        // Don't return here - continue to increment and navigate
      } else {
        // No more pages available, wrap to first issue
        console.log('GitHub Navigator: At last issue, wrapping to first issue...');
        this.currentIndex = 0;
        console.log('GitHub Navigator: Wrapped to first issue', {
          newIndex: this.currentIndex,
          newIssue: this.issues[this.currentIndex]?.title
        });
        
        // Save state before navigating
        this.saveIssuesToStorage();
        this.navigateToIssue(this.currentIndex);
        this.showNotification(`Wrapped to first issue (1/${this.issues.length})`);
        return;
      }
    }

    this.currentIndex++;
    console.log('GitHub Navigator: Moving to next issue', {
      newIndex: this.currentIndex,
      newIssue: this.issues[this.currentIndex]?.title,
      previousIssue: this.currentIndex > 0 ? this.issues[this.currentIndex - 1]?.title : 'None',
      nextIssue: this.currentIndex < this.issues.length - 1 ? this.issues[this.currentIndex + 1]?.title : 'None'
    });
    
    // Save state before navigating
    this.saveIssuesToStorage();
    this.navigateToIssue(this.currentIndex);
  }

  async navigatePrevious() {
    if (!this.isNavigating) {
      return;
    }

    // Validate navigation state
    if (this.currentIndex < 0 || this.issues.length === 0) {
      console.warn('GitHub Navigator: Invalid navigation state in navigatePrevious', {
        currentIndex: this.currentIndex,
        issuesLength: this.issues.length,
        isNavigating: this.isNavigating
      });
      this.showNotification('Invalid navigation state. Please restart navigation.');
      this.isNavigating = false;
      this.currentIndex = -1;
      this.updateIndicator();
      return;
    }

    // If we're at the first issue, wrap around to the last currently loaded issue
    if (this.currentIndex <= 0) {
      console.log('GitHub Navigator: At first issue, wrapping to last loaded issue...');
      
      // Go to the last currently loaded issue
      if (this.issues.length > 0) {
        this.currentIndex = this.issues.length - 1;
        console.log('GitHub Navigator: Wrapped to last loaded issue', {
          newIndex: this.currentIndex,
          newIssue: this.issues[this.currentIndex]?.title
        });
        
        // Save state before navigating
        this.saveIssuesToStorage();
        this.navigateToIssue(this.currentIndex);
        this.showNotification(`Wrapped to last loaded issue (${this.issues.length}/${this.issues.length})`);
      } else {
        this.showNotification('No issues available');
      }
      return;
    }

    console.log('GitHub Navigator: navigatePrevious() called', {
      currentIndex: this.currentIndex,
      totalIssues: this.issues.length,
      currentIssue: this.issues[this.currentIndex]?.title
    });

    this.currentIndex--;
    console.log('GitHub Navigator: Moving to previous issue', {
      newIndex: this.currentIndex,
      newIssue: this.issues[this.currentIndex]?.title,
      previousIssue: this.currentIndex > 0 ? this.issues[this.currentIndex - 1]?.title : 'None',
      nextIssue: this.currentIndex < this.issues.length - 1 ? this.issues[this.currentIndex + 1]?.title : 'None'
    });
    
    // Save state before navigating
    this.saveIssuesToStorage();
    this.navigateToIssue(this.currentIndex);
  }

  navigateToIssue(index, direction = 'left') {
    if (index < 0 || index >= this.issues.length) {
      console.warn('GitHub Navigator: Invalid issue index', { index, totalIssues: this.issues.length });
      return;
    }

    const issue = this.issues[index];
    console.log('GitHub Navigator: Navigating to issue', {
      index: index,
      title: issue.title,
      url: issue.url
    });
    
    // Update indicator before navigating to show correct position
    this.updateIndicator();
    
    // Hide the indicator after 1 second
    setTimeout(() => {
      this.hideNavigationIndicator();
    }, 1000);
    
    // Save state before navigating to preserve our position
    console.log('GitHub Navigator: Saving state before navigation', {
      currentIndex: this.currentIndex,
      isNavigating: this.isNavigating
    });
    this.saveIssuesToStorage();
    
    this.navigateWithTransition(issue.url);
  }

  navigateWithTransition(url) {
    // Create a simple fade overlay for the transition
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100vh;
      background: rgba(0, 0, 0, 0.1);
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    `;
    
    document.body.appendChild(overlay);
    
    // Show the overlay with a quick fade
    setTimeout(() => {
      overlay.style.opacity = '1';
    }, 10);
    
    // Navigate after a brief delay to show the transition
    setTimeout(() => {
      window.location.href = url;
    }, 150);
  }

  showNotification(message) {
    // Remove existing notification
    const existing = document.getElementById('github-nav-notification');
    if (existing) existing.remove();

    // Create new notification
    const notification = document.createElement('div');
    notification.id = 'github-nav-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 3000);
  }
}

// Initialize the navigator when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    new GitHubIssuesNavigator();
  });
} else {
  new GitHubIssuesNavigator();
}
