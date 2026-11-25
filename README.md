# GitHub Issues Navigator

A browser extension that lets you step through the issues and pull requests in any repository's issue or pull request list, one by one, without going back to the list each time.

## Features

- ⏭️ **Previous and Next controls**: Open an issue or pull request from a list and the controls appear on the row under its title, below **New issue**, with your position (for example, `4 of 13`) and a **Back to list** link
- 🔒 **Private and internal repositories**: Reads the list through your normal GitHub sign-in, so it works anywhere you can see the list, with no token to set up
- 🔍 **Any filter**: Follows exactly what the list shows, including labels, state, author, sort order and the page you were on
- 🔀 **Issues and pull requests**: Works from issue lists and pull request lists, including a pull request's **Commits**, **Checks** and **Files changed** tabs
- 📄 **Long lists**: Loads more of the list as you reach the end of a page
- ⌨️ **Keyboard shortcuts**: `Alt+]` and `Alt+[` step forward and back from anywhere on the page
- 📌 **Stays in reach**: A compact copy of the controls sits in GitHub's header while you scroll
- 🗂️ **New tabs and history**: Items opened from a list in a new tab get their own controls, and browser Back returns them after a detour
- 🌗 **Looks like GitHub**: Uses GitHub's own colours, so it follows light, dark and high-contrast themes
- ♿ **Accessible**: Labelled for screen readers, reachable by keyboard, and announces the start and end of the list

## How to use

1. Open a repository's issues or pull requests list, for example
   `https://github.com/dotnet/aspnetcore/issues?q=is%3Aissue+state%3Aopen+label%3Aarea-middleware`.
2. Open any item from the list. The controls appear at the right of the row under its title (below **New issue** on an issue).
3. Select **Next** or **Previous**, or press `Alt+]` and `Alt+[`.
4. Select **Back to list** or press `Alt+↑` to return to the list, on the page that holds the current item.

You can also start from the list itself: `Alt+]` opens the first item on the page and `Alt+[` opens the last.

The controls only appear for items opened from a list, and stay while you step through it. An issue you open from anywhere else, such as a notification or a link, looks exactly as it does without the extension.

## Keyboard shortcuts

| Shortcut             | On a list           | On an issue or pull request |
|----------------------|---------------------|-----------------------------|
| `Alt+]`              | Open the first item | Next item                   |
| `Alt+[`              | Open the last item  | Previous item               |
| `Alt+→`              |                     | Next item                   |
| `Alt+←`              |                     | Previous item               |
| `Alt+↑`              |                     | Back to list                |

`Alt+[` and `Alt+]` avoid the browser's own `Alt+←` and `Alt+→` (Back and Forward). The arrow versions still work on an issue or pull request while you are stepping through a list, so Back and Forward behave normally everywhere else. Shortcuts never fire while you are typing in a text box.

## Installation (development)

### Edge or Chrome

1. Clone or download this repository.
2. Open your browser's extensions page (`edge://extensions/` or `chrome://extensions/`).
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the folder that holds `manifest.json`.
5. Open a GitHub issues list and open an item from it.

### Firefox

1. Clone or download this repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on…** and choose `manifest.json`.
4. Open a GitHub issues list and open an item from it.

Firefox removes temporary add-ons when it closes, so load it again after restarting.

### Browser compatibility

- ✅ Microsoft Edge
- ✅ Chrome
- ✅ Firefox 121 or later
- ⚠️ Safari (requires conversion to Safari extension format)

## Project structure

```text
github-issues-navigator/
├── manifest.json          # Extension configuration
├── src/
│   ├── routes.js          # Recognises list and item URLs
│   ├── list-data.js       # Reads the list data GitHub's list pages return
│   ├── queue.js           # Position, next and previous across pages
│   ├── context.js         # Decides which list an item was opened from
│   ├── keys.js            # Keyboard shortcuts
│   ├── controls.js        # The on-page controls
│   └── main.js            # Wires it together and follows GitHub's page changes
├── styles.css             # Styles for the controls
├── popup.html             # Extension popup
├── icons/
└── tests/                 # Unit tests (node --test)
```

## Technical details

- The extension asks GitHub for the same list you are looking at, as JSON (`Accept: application/json`), with your existing session. If GitHub sends the HTML page instead, it reads the list data embedded in that page.
- Lists of up to four pages are loaded in full when you start, so the order stays stable while you work through them, even if you close items as you go. Longer lists load the neighbouring pages as you move.
- The controls find the row under the title by its state label (**Open**, **Closed**, **Draft** and so on), which works with both GitHub's current and older page headers. If GitHub's layout changes and that row can't be found, the controls float at the bottom of the page instead.
- The current list is kept in the tab's `sessionStorage` (issue numbers and URLs only), so each tab can step through a different list. Nothing leaves your browser except requests to `github.com`.
- The only permission is access to `github.com`. There is no background script.

## Known limitations

- Only a repository's own issues and pull requests lists (`/owner/repo/issues` and `/owner/repo/pulls`, with any filter) start stepping. Cross-repository views such as `github.com/issues`, search results and project boards don't.
- GitHub shows at most 40 pages (1,000 items) of a list, so stepping stops there even when the count says more.
- In lists longer than four pages, the list can change while you step. If others add items, the extension skips anything you've already passed. If items before your position are closed or removed, later items move up onto a page you've already loaded and can be skipped.
- GitHub can change its page structure at any time. The floating fallback keeps the controls usable, but placement may need an update.

## Development

### Prerequisites

- A Chromium-based browser or Firefox
- Node.js 18 or later to run the tests

### Running tests

```bash
node --test
```

The tests use fictional data and need no dependencies.

### Making changes

1. Edit the files in `src/` or `styles.css`.
2. Reload the extension from the extensions page.
3. Reload the GitHub page and open an item from a list.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes and run the tests
4. Try them on a few GitHub lists
5. Submit a pull request

## License

MIT License - feel free to use and modify as needed.

## Troubleshooting

### The controls don't appear

- Open the item from a list. The controls don't appear for items opened from a notification, a search or a link.
- Reload the GitHub page after installing or updating the extension.
- Check the browser console for messages starting with `GitHub Issues Navigator`.

### The controls don't appear on a private list, or you see "Couldn't load this list"

- Make sure you're signed in to GitHub in this browser and can see the list. For organizations that use single sign-on, open the list once to renew your session.

### Keyboard shortcuts don't respond

- Click somewhere on the page that isn't a text box, then try again.
- Check whether another extension uses the same shortcut.

## Future enhancements

### Stepping through a list

- [ ] Show the next item's title on hover
- [ ] Show the list's filter in the controls
- [ ] Jump to any item in the list
- [ ] Mark items you've already visited

### Triage

- [ ] Quick triage actions from the controls (label, close, comment)

### More lists

- [ ] Other repository list pages, such as a label's page (`/labels/<name>`)
- [ ] Cross-repository views: `github.com/issues`, `github.com/pulls` and search results
- [ ] Project boards and saved views
- [ ] GitHub Enterprise Server instances

### Settings and distribution

- [ ] Customizable keyboard shortcuts
- [ ] Publish to the Edge Add-ons, Chrome Web Store and Firefox Add-ons stores
- [ ] Safari version
