# GitHub Issues Navigator

A browser extension that allows you to navigate through GitHub issues and pull requests using keyboard shortcuts, with smooth visual transitions.

## Features

- 🚀 **Quick Navigation**: Start with `Alt+→` (first issue) or `Alt+←` (last issue)
- ⬅️➡️ **Arrow Key Navigation**: Continue using `Alt+←` and `Alt+→` to move between issues
- 🎨 **Visual Transitions**: Smooth sliding animations between issues
- 📊 **Progress Indicator**: Always know your position in the issue list
- 🔄 **Easy Exit**: Press `Alt+↑` to return to the original page
- 📱 **Responsive Design**: Works on both desktop and mobile GitHub
- 🔍 **Smart Filtering**: Works with GitHub's issue filters (labels, state, author, etc.)
- 📄 **Auto-Pagination**: Automatically loads more issues when reaching the end of current page
- ⚡ **GraphQL Powered**: Uses GitHub's GraphQL API for reliable and fast issue loading
- 💾 **State Persistence**: Maintains navigation position across page transitions

## How to Use

1. **Navigate to a GitHub Issues/PRs page**: 
   - Go to any repository's issues page (e.g., `https://github.com/dotnet/aspnetcore/issues`)
   - Or pull requests page (e.g., `https://github.com/dotnet/aspnetcore/pulls`)
   - Works with filtered pages (e.g., `https://github.com/dotnet/aspnetcore/issues?q=is%3Aissue+state%3Aopen+label%3Aarea-middleware`)

2. **Start Navigation**: 
   - Press `Alt+→` to start from the first issue
   - Press `Alt+←` to start from the last issue

3. **Navigate Issues**:
   - `Alt+→`: Go to next issue (automatically loads more when reaching end of page)
   - `Alt+←`: Go to previous issue
   - `Alt+↑`: Stop navigation and return to list

4. **Visual Feedback**: 
   - A blue indicator appears in the top-right showing your progress
   - Shows current position and total loaded issues (e.g., "5/25 (+more)" when more pages available)
   - Smooth slide transitions show direction of navigation
   - Notifications confirm your actions and loading status

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+→` | Start from first issue / Next issue |
| `Alt+←` | Start from last issue / Previous issue |
| `Alt+↑` | Exit navigation mode |

## Installation (Development)

### Local Testing

1. **Clone/Download the extension files**:
   ```
   git clone <repository-url>
   # or download and extract the ZIP
   ```

2. **Open Edge Extensions Page**:
   - Navigate to `edge://extensions/`

3. **Enable Developer Mode**:
   - Toggle the "Developer mode" switch in the left sidebar

4. **Load the Extension**:
   - Click "Load unpacked"
   - Select the folder containing the extension files (`c:\code\ghissuenav`)

5. **Test the Extension**:
   - Go to any GitHub repository's issues page
   - Try the keyboard shortcuts listed above

### Browser Compatibility

- ✅ Microsoft Edge (recommended for your setup)
- ✅ Chrome 
- ✅ Firefox (may require minor manifest adjustments)
- ⚠️ Safari (requires conversion to Safari extension format)

## Project Structure

```
github-issues-navigator/
├── manifest.json          # Extension configuration
├── content.js             # Main navigation logic
├── styles.css             # Visual styles and animations
├── popup.html             # Extension popup interface
├── icons/                 # Extension icons
│   ├── icon16.svg
│   ├── icon48.svg
│   └── icon128.svg
├── .github/
│   └── copilot-instructions.md
└── README.md
```

## Technical Details

### Manifest V3 Features
- Uses modern `content_scripts` for GitHub integration
- Minimal permissions (`activeTab`, `scripting`)
- Host permissions limited to GitHub domains

### Content Script Features
- Automatically detects issue/PR links on GitHub pages
- Maintains navigation state during session
- Handles GitHub's dynamic content loading
- Provides visual feedback and transitions

### Styling Features
- CSS3 animations for smooth transitions
- Responsive design for various screen sizes
- GitHub-compatible color scheme
- Non-intrusive overlay indicators

## Development

### Prerequisites
- Modern web browser (Chrome/Edge recommended for testing)
- Basic knowledge of JavaScript and browser extensions

### Making Changes
1. Edit the relevant files (`content.js`, `styles.css`, etc.)
2. Reload the extension in your browser:
   - Go to extensions page (`chrome://extensions/`)
   - Click the reload button for "GitHub Issues Navigator"
3. Test on a GitHub issues page

### Debugging
- Use browser DevTools on GitHub pages to debug content script
- Check the extension popup for any errors
- Console logs are available in the DevTools console

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on various GitHub pages
5. Submit a pull request

## License

MIT License - feel free to use and modify as needed.

## Troubleshooting

### Extension Not Working
- Ensure Developer Mode is enabled
- Check that the extension is loaded and enabled
- Refresh the GitHub page after installing/updating
- Check browser console for any errors

### Keyboard Shortcuts Not Responding
- Make sure you're on a GitHub issues or pulls page
- Ensure the page has finished loading
- Try clicking somewhere on the page first to focus it
- Check if another extension is intercepting the shortcuts

### Navigation Indicator Not Showing
- The indicator appears automatically when on supported GitHub pages
- Try refreshing the page
- Check if the extension has proper permissions

## Future Enhancements

- [ ] Support for GitHub Enterprise instances
- [ ] Customizable keyboard shortcuts
- [ ] Bookmarking specific issues during navigation
- [ ] Integration with GitHub notifications
- [ ] Support for other code hosting platforms
