# Pages Publisher — SiYuan Note to Pages

One-click publish SiYuan notes as static HTML to Gitee Pages or GitHub Pages.

## Rendering

Published pages use SiYuan's built-in **Protyle rendering engine** and **current theme CSS**, matching the editor preview exactly. Automatically includes:
- Current SiYuan theme styles
- Sidebar table of contents (TOC) with scroll tracking
- Enabled CSS/JS snippets and Petals
- Responsive layout for mobile

## Prerequisites

### GitHub Pages (recommended, no real-name verification)

1. Create a repo named `yourusername.github.io`
2. Settings → Pages → Source: `main` → Save
3. `git clone` locally

### Gitee Pages (requires real-name verification in China)

1. Create a repo (ideally matching your username)
2. Services → Gitee Pages → Start
3. `git clone` locally

Both platforms can be configured simultaneously and switched at any time.

## Usage

1. Restart SiYuan — icon appears in the top toolbar
2. Click icon → choose Gitee or GitHub → fill in local repo path and Pages URL
3. Open a note → click icon → one-click publish
4. Visit your Pages URL: GitHub auto-deploys in 1-3 min; Gitee requires manual "Update"

## Features

- Dual platform: Gitee + GitHub, switch anytime
- SiYuan native rendering via Protyle engine — what you see is what you get
- Auto-generated sidebar TOC with scroll-aware highlighting, mobile collapsible
- Full Markdown: headings, lists, code blocks, tables, blockquotes, images, links
- Auto-attaches enabled CSS/JS snippets and Petals
- Auto Git: add → commit → push
- Publish history with re-publish, delete, manual push, and push status tracking
- Multi-repo / multi-URL history management with custom tags and filtering
- Open config directory for manual editing of `pages-pub-config`
- Share list auto-sync with local repo files after pull/push

## Output Structure

```
repo root/
├── pages-pub-assets/          # Shared assets (theme CSS, Protyle JS)
├── doc-directory/             # One subdirectory per note
│   ├── index.html
│   └── assets/...             # Linked resources
```

## Notes

- Requires Git CLI
- Repo path is best set to a locally cloned Pages repo; before export, the plugin now checks Git status and blocks unsafe auto-push cases
- GitHub Pages deploys automatically; Gitee Pages (free) needs manual "Update" click
- Import images as SiYuan resources or use an image hosting plugin
- Switching SiYuan themes requires re-publishing to sync styles

## Troubleshooting

**Push conflict**: Run `git pull --rebase` in the repo directory, then retry.

**Upstream missing / manual `git init + remote add`**: If the remote already has files from another computer, back up the current folder and re-clone the remote repo, or let the plugin safely initialize tracking only when the local repo has no commits and the worktree is clean.

**Auth error**: Use SSH keys or Personal Access Token for GitHub.

**Images not showing**: Ensure images are SiYuan resource files, not local absolute paths.

**Style mismatch**: Published appearance depends on the active SiYuan theme. Re-publish after switching themes.

## Changelog

### v1.0.5

- Add publish-time Git repo inspection before exporting files, so unsafe no-upstream repos fail early instead of after local files are written.
- Support safe first-push `git push -u origin <branch>` for empty remotes, and safe remote-tracking branch initialization when the remote already has commits but the local repo is still clean with no commits.
- Improve no-upstream error hints with re-clone guidance for manually initialized folders pointing at an existing remote Pages repo.
- Fix share list alignment with the main config area.
- Replace tag editing prompt with an inline editor and persist tag changes reliably.
- Support semicolons as a tag separator.
- Multi-repo / multi-URL history: each platform saves a history of repo paths and Pages URLs for quick switching and management.
- Open config directory: button in settings to open the plugin data directory for manual `pages-pub-config` editing.
- Share list auto-sync after pull/push and refresh tree share markers from disk.
- `syncRemoteThenPush` improvements: check workspace cleanliness before pull and abort rebase conflicts with clear prompts.
- TOC and delete-refresh fixes, plus push progress now reaches 100% on success/skip/sync paths.

## License

MIT
