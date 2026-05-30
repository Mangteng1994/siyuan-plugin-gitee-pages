# AGENTS.md for `siyuan-plugin-gitee-pages`

## Project Summary

Repo = SiYuan desktop plugin. Publish doc → static HTML → Gitee Pages / GitHub Pages.

Render export pages via SiYuan Protyle runtime. Copy required shared assets into target repo → published result stay close to in-app reading.

## Repository Facts

- Main entry: `index.js`
- Plugin manifest: `plugin.json`
- Chinese locale: `i18n/zh_CN.json`
- User-facing docs: `README.md`, `README_zh_CN.md`
- Images/assets in repo root: `icon.png`, `preview.png`

No TS source. `index.js` = bundled output. Only code file edit here.

## Runtime Shape

`index.js` export class extends `Plugin` from `"siyuan"`.

Important constants:

- `STORAGE_KEY = "pages-pub-config"`: in-memory config slot
- `STORAGE_FILE = "pages-pub-config"`: persisted config file for `loadData` and `saveData`
- `SHARED_ASSETS_DIR = "pages-pub-assets"`: folder copied into the target Pages repository

## Config Model

Normalized config shape:

```js
{
  platform: "gitee" | "github",
  gitee: { repoPath: "", pagesUrl: "" },
  github: { repoPath: "", pagesUrl: "" },
  autoCommit: true,
  gitProxy: "",
  shares: [],
}
```

Config lifecycle:

- `defaultConfig()` define defaults
- `normalizeConfig(cfg)` = shape gate (canonical)
- `loadConfig()` load persisted data + normalize
- `persistConfig(cfg)` normalize + save async
- `persistConfigAndWait(cfg)` normalize + save with `await`
- `onload()` seed runtime state from `loadConfig()` + persist normalized defaults immediately

## Critical Rule: Adding Config Fields

Add new config field → update all 3:

1. `defaultConfig()`
2. `normalizeConfig()`
3. Settings UI inside `showPanel()` so saved values are read back into inputs

Miss any → field reset or silently dropped on load/save.

## Settings Panel Notes

Settings UI built in `showPanel()` via SiYuan `Setting` API.

Current pattern:

- Inputs mutate `this.data[STORAGE_KEY]` directly
- Save handlers call `that.persistConfig(data)`
- The `data` object is a live config reference, not a copied snapshot

Change settings behavior → preserve flow unless strong reason refactor whole panel consistently.

## Share Record Notes

Share history is normalized and managed through:

- `normalizeShareRecord()`
- `getShareRecords()`
- `upsertShareRecord()`
- `removeShareRecord()`

No ad hoc share objects into config. Must go normalization path.

## Git Execution Notes

Git cmds run via `runCommand(cmd, options)`.

- `getGitProxy()` reads `this.data[STORAGE_KEY]?.gitProxy`
- If `cmd` starts with `"git "`, `runCommand()` may inject `-c http.proxy=...` and `-c https.proxy=...`
- Empty `gitProxy` means no proxy flags are injected

Any change to git cmd construction must preserve proxy injection for both Gitee/GitHub flows.

## Publishing Model

Publish into user-provided local git repo.

Typical output layout:

```text
repo-root/
  pages-pub-assets/
  some-note/
    index.html
    assets/
```

Publishing work in `index.js` includes:

- generating rendered HTML
- copying shared assets
- synchronizing note assets
- updating share records
- optionally running git add/commit/push

Change publish logic → check first-publish + re-publish paths.

## Editing Rules for This Repo

- Edit `index.js` directly; do not assume an unbundled source tree exists locally
- Keep patch minimal/local; file bundled + big
- Reuse existing helper methods and patterns instead of introducing parallel implementations
- Do not add scratch files, temporary scripts, or extra folders unless absolutely necessary
- If you touch user-visible behavior, update `README.md` and `README_zh_CN.md` when the change materially affects usage
- Bump `plugin.json` version only when the task explicitly requires a release/version update
- Do not change the plugin version for review-only or marketplace-fix tasks unless explicitly requested

## Lifecycle Rules

- Persistent plugin config via `saveData(STORAGE_FILE, ...)` must be cleaned in `async uninstall()` via `removeData(STORAGE_FILE)`
- No config cleanup in `onunload()`; disable plugin must not delete user config
- `async uninstall()` must clean `pages-pub-config` created by `saveData(STORAGE_FILE, ...)`
- `async uninstall()` may best-effort remove `data/storage/petal/siyuan-plugin-gitee-pages` (plugin-owned persisted storage)
- Do not sync remove `data/plugins/siyuan-plugin-gitee-pages` inside plugin `uninstall()` hook; install dir owned by SiYuan community package remover
- Never delete `gitee.repoPath`, `github.repoPath`, `shares[*].repoPath`; those real user repos, not plugin-owned storage

## Localization Rules

- If the repository ships an `i18n/` directory, wired UI strings must use `this.i18n` with a safe fallback
- If a locale key is introduced for bundled UI, provide at least `zh_CN.json` and `en_US.json`
- Do not leave packaged locale keys completely unused in code

## Settings Persistence Rules

- For persisted settings fields, prefer `change` over `input` when each keystroke would trigger `saveData()`
- Real-time `input` listeners are acceptable for local filtering or UI-only state that does not write plugin data

## Validation Checklist

Before call change "done": verify as many as task allows:

- Config still round-trips through load/save without field loss
- Settings panel reflects saved values after reopening
- Gitee and GitHub config branches both still work
- Share history still normalizes and persists correctly
- Git proxy still applies only to git commands
- Generated asset paths still respect `SHARED_ASSETS_DIR`
- No obvious regression in publish, republish, or auto-commit flows
- Uninstall removes `data/storage/petal/siyuan-plugin-gitee-pages/pages-pub-config`
- Uninstall best-effort removes `data/storage/petal/siyuan-plugin-gitee-pages`
- `data/plugins/siyuan-plugin-gitee-pages` is removed by SiYuan's own community package uninstall flow, not by synchronous plugin self-deletion
- Uninstall leaves user-configured Pages local repositories untouched

## Search Anchors

Fast find symbols:

- `defaultConfig`
- `normalizeConfig`
- `loadConfig`
- `persistConfig`
- `persistConfigAndWait`
- `normalizeShareRecord`
- `getShareRecords`
- `upsertShareRecord`
- `removeShareRecord`
- `showPanel`
- `runCommand`
- `getGitProxy`

## Agent Working Rules

Work in this repo:

1. Start non-trivial work with a visible plan.
2. Keep steps atomic and verifiable.
3. Prefer direct inspection over assumptions because `index.js` is bundled output.
4. Clean up after yourself completely; leave no temporary artifacts.
5. Do not ship a config change unless the full config lifecycle has been checked.
6. If blocked, state the exact blocker, attempted mitigation, and the missing information or access needed.
7. Default reply style: use Caveman skill, intensity `full`, unless the user explicitly asks for another style.
