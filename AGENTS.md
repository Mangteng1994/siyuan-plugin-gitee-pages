# AGENTS.md for `siyuan-plugin-gitee-pages`

## Project Summary

This repository contains a SiYuan Note desktop plugin that publishes a document as static HTML to either Gitee Pages or GitHub Pages.

The plugin renders exported pages with SiYuan's Protyle runtime and copies the required shared assets into the target repository so the published result stays close to the in-app reading experience.

## Repository Facts

- Main entry: `index.js`
- Plugin manifest: `plugin.json`
- Chinese locale: `i18n/zh_CN.json`
- User-facing docs: `README.md`, `README_zh_CN.md`
- Images/assets in repo root: `icon.png`, `preview.png`

There is no source TypeScript in this repository. `index.js` is bundled output and is the only code file that should be edited here.

## Runtime Shape

`index.js` exports a class extending `Plugin` from `"siyuan"`.

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

- `defaultConfig()` defines defaults
- `normalizeConfig(cfg)` is the canonical shape gate
- `loadConfig()` loads persisted data and normalizes it
- `persistConfig(cfg)` normalizes then saves asynchronously
- `persistConfigAndWait(cfg)` normalizes then saves with `await`
- `onload()` seeds runtime state from `loadConfig()` and immediately persists normalized defaults

## Critical Rule: Adding Config Fields

When introducing any new config field, update all of the following:

1. `defaultConfig()`
2. `normalizeConfig()`
3. Settings UI inside `showPanel()` so saved values are read back into inputs

If any of these three are missed, the field will be reset or silently dropped on load/save.

## Settings Panel Notes

The settings UI is built inside `showPanel()` with SiYuan's `Setting` API.

Current pattern:

- Inputs mutate `this.data[STORAGE_KEY]` directly
- Save handlers call `that.persistConfig(data)`
- The `data` object is a live config reference, not a copied snapshot

When changing settings behavior, preserve that flow unless there is a strong reason to refactor the whole panel consistently.

## Share Record Notes

Share history is normalized and managed through:

- `normalizeShareRecord()`
- `getShareRecords()`
- `upsertShareRecord()`
- `removeShareRecord()`

Do not write ad hoc share objects directly into config without passing through the normalization path.

## Git Execution Notes

Git commands are run through `runCommand(cmd, options)`.

- `getGitProxy()` reads `this.data[STORAGE_KEY]?.gitProxy`
- If `cmd` starts with `"git "`, `runCommand()` may inject `-c http.proxy=...` and `-c https.proxy=...`
- Empty `gitProxy` means no proxy flags are injected

Any change to git command construction must preserve proxy injection behavior for both Gitee and GitHub flows.

## Publishing Model

The plugin publishes into a user-provided local git repository.

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

When changing publish logic, check both first-publish and re-publish paths.

## Editing Rules for This Repo

- Edit `index.js` directly; do not assume an unbundled source tree exists locally
- Keep patches minimal and localized because the file is bundled and large
- Reuse existing helper methods and patterns instead of introducing parallel implementations
- Do not add scratch files, temporary scripts, or extra folders unless absolutely necessary
- If you touch user-visible behavior, update `README.md` and `README_zh_CN.md` when the change materially affects usage
- Bump `plugin.json` version only when the task explicitly requires a release/version update
- Do not change the plugin version for review-only or marketplace-fix tasks unless explicitly requested

## Lifecycle Rules

- Persistent plugin config stored with `saveData(STORAGE_FILE, ...)` must be cleaned up in `async uninstall()` via `removeData(STORAGE_FILE)`
- Do not put config cleanup in `onunload()`, because disabling the plugin must not delete user configuration

## Localization Rules

- If the repository ships an `i18n/` directory, wired UI strings must use `this.i18n` with a safe fallback
- If a locale key is introduced for bundled UI, provide at least `zh_CN.json` and `en_US.json`
- Do not leave packaged locale keys completely unused in code

## Settings Persistence Rules

- For persisted settings fields, prefer `change` over `input` when each keystroke would trigger `saveData()`
- Real-time `input` listeners are acceptable for local filtering or UI-only state that does not write plugin data

## Validation Checklist

Before considering a change done, verify as many of these as the task allows:

- Config still round-trips through load/save without field loss
- Settings panel reflects saved values after reopening
- Gitee and GitHub config branches both still work
- Share history still normalizes and persists correctly
- Git proxy still applies only to git commands
- Generated asset paths still respect `SHARED_ASSETS_DIR`
- No obvious regression in publish, republish, or auto-commit flows

## Search Anchors

Useful symbols to locate related logic quickly:

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

When operating in this repository:

1. Start non-trivial work with a visible plan.
2. Keep steps atomic and verifiable.
3. Prefer direct inspection over assumptions because `index.js` is bundled output.
4. Clean up after yourself completely; leave no temporary artifacts.
5. Do not ship a config change unless the full config lifecycle has been checked.
6. If blocked, state the exact blocker, attempted mitigation, and the missing information or access needed.
