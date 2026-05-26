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
- Auto-generated sidebar TOC with scroll-aware highlighting
- Full Markdown: headings, lists, code blocks, tables, blockquotes, images, links
- Auto-attaches enabled CSS/JS snippets and Petals
- Auto Git: add → commit → push
- Publish history with re-publish support

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
- Repo path must be a locally cloned directory
- GitHub Pages deploys automatically; Gitee Pages (free) needs manual "Update" click
- Import images as SiYuan resources or use an image hosting plugin
- Switching SiYuan themes requires re-publishing to sync styles

## Troubleshooting

**Push conflict**: Run `git pull --rebase` in the repo directory, then retry.

**Auth error**: Use SSH keys or Personal Access Token for GitHub.

**Images not showing**: Ensure images are SiYuan resource files, not local absolute paths.

**Style mismatch**: Published appearance depends on the active SiYuan theme. Re-publish after switching themes.

## License

MIT
