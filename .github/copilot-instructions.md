<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# GitHub Issues Navigator Extension

This is a browser extension project for navigating GitHub issues and pull requests with keyboard shortcuts.

## Project Context
- **Type**: Browser Extension (Manifest V3)
- **Target**: GitHub website integration
- **Primary Language**: JavaScript (ES6+)
- **Styling**: CSS3 with modern features

## Key Features
- Keyboard-driven navigation through GitHub issues/PRs
- Visual transitions between issues
- Persistent navigation state
- Responsive design for mobile and desktop

## Development Guidelines
- Follow Web Extensions API best practices
- Ensure compatibility with GitHub's dynamic content loading
- Use modern JavaScript features (async/await, arrow functions, etc.)
- Maintain accessibility standards
- Keep the extension lightweight and performant

## Browser Extension Specific Notes
- Uses Manifest V3 format
- Content scripts inject into GitHub pages
- No background scripts needed for this functionality
- Focuses on content script and popup interaction
