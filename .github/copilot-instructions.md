<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# GitHub Issues Navigator Extension

This is a browser extension project for stepping through GitHub issues and pull requests in a list, with on-page Previous / Next controls and keyboard shortcuts.

## Project Context
- **Type**: Browser Extension (Manifest V3)
- **Target**: GitHub website integration
- **Primary Language**: JavaScript (ES6+)
- **Styling**: CSS3 with modern features

## Key Features
- Previous / Next controls injected under GitHub's "New issue" button, plus keyboard shortcuts
- Works on public, private and internal repositories through the user's GitHub session
- Per-tab navigation state in sessionStorage
- Responsive design for mobile and desktop

## Development Guidelines
- Follow Web Extensions API best practices
- Ensure compatibility with GitHub's dynamic content loading
- Use modern JavaScript features (async/await, arrow functions, etc.)
- Maintain accessibility standards
- Keep the extension lightweight and performant
- Keep logic that can run without a DOM in `src/` modules covered by `node --test`

## Browser Extension Specific Notes
- Uses Manifest V3 format; supports Edge, Chrome and Firefox 121+
- Content scripts inject into GitHub pages
- Reads list data from github.com with the user's session; never calls api.github.com
- No background scripts needed for this functionality
- Focuses on content script and popup interaction
