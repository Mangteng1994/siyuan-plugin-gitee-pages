/**
 * SiYuan Pages Publisher
 * 一键发布思源笔记到 Gitee Pages / GitHub Pages
 * Editorial 风格 HTML 模板
 */
const { Plugin, showMessage, fetchSyncPost, Setting } = require("siyuan");
const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const STORAGE_KEY = "pages-pub-config";
const STORAGE_FILE = "pages-pub-config";
const SHARED_ASSETS_DIR = "pages-pub-assets";
const execAsync = promisify(exec);

class PagesPublisher extends Plugin {
    constructor(options) {
        super(options);
        this.currentProtyle = null;
        this.currentDocId = "";
        this.currentDocTitle = "";
        this.lastActiveDocInfo = {
            docId: "",
            title: "",
            updatedAt: 0,
            source: "",
        };
        this.openSetting = this.openSetting.bind(this);
        this.publishTask = null;
        this.progressEl = null;
    }

    defaultConfig() {
        return {
            platform: "gitee",
            gitee: { repoPath: "", pagesUrl: "", siteTitle: "Notes" },
            github: { repoPath: "", pagesUrl: "", siteTitle: "Notes" },
            autoCommit: true,
            shares: [],
        };
    }

    normalizeConfig(cfg) {
        const d = cfg || {};
        const shares = Array.isArray(d.shares) ? d.shares.map((item) => this.normalizeShareRecord(item)).filter(Boolean) : [];
        return {
            platform: d.platform === "github" ? "github" : "gitee",
            gitee: {
                repoPath: d?.gitee?.repoPath || "",
                pagesUrl: (d?.gitee?.pagesUrl || "").replace(/\/+$/, ""),
                siteTitle: d?.gitee?.siteTitle || "Notes",
            },
            github: {
                repoPath: d?.github?.repoPath || "",
                pagesUrl: (d?.github?.pagesUrl || "").replace(/\/+$/, ""),
                siteTitle: d?.github?.siteTitle || "Notes",
            },
            autoCommit: d.autoCommit !== false,
            shares,
        };
    }

    normalizeShareRecord(record) {
        if (!record || typeof record !== "object") return null;
        const platform = record.platform === "github" ? "github" : "gitee";
        const createdAt = record.createdAt || record.updatedAt || new Date().toISOString();
        const updatedAt = record.updatedAt || createdAt;
        return {
            id: String(record.id || `${platform}-${record.docId || "doc"}-${record.slug || "share"}`),
            docId: String(record.docId || ""),
            title: String(record.title || "Untitled"),
            platform,
            slug: String(record.slug || ""),
            url: String(record.url || ""),
            repoPath: String(record.repoPath || ""),
            createdAt,
            updatedAt,
            autoCommit: record.autoCommit !== false,
            access: record.access && typeof record.access === "object" ? record.access : undefined,
        };
    }

    async loadConfig() {
        let cfg = null;
        try {
            if (typeof this.loadData === "function") {
                cfg = await this.loadData(STORAGE_FILE);
            }
        } catch (e) { /* ignore */ }
        if (!cfg && this.data && this.data[STORAGE_KEY]) cfg = this.data[STORAGE_KEY];
        return this.normalizeConfig(cfg || this.defaultConfig());
    }

    persistConfig(cfg) {
        const normalized = this.normalizeConfig(cfg);
        this.data[STORAGE_KEY] = normalized;
        try {
            if (typeof this.saveData === "function") {
                this.saveData(STORAGE_FILE, normalized);
            }
        } catch (e) { /* ignore */ }
    }

    async onload() {
        // 显式加载并持久化默认配置，避免重启后丢失
        this.data[STORAGE_KEY] = await this.loadConfig();
        this.persistConfig(this.data[STORAGE_KEY]);

        // 图标
        this.addIcons(`<symbol id="iconPagesPub" viewBox="0 0 24 24">
            <path fill="currentColor" d="M5 4v2h14V4H5zm0 10h4v6h6v-6h4l-7-7-7 7z"/>
        </symbol>`);

        // 顶栏按钮 → 打开设置面板
        this.addTopBar({
            icon: "iconPagesPub",
            title: "发布到 Pages",
            position: "right",
            callback: () => this.showPanel(),
        });

        // 监听文档切换
        this.eventBus.on("switch-protyle", ({ detail }) => {
            this.currentProtyle = detail?.protyle;
            this.updateDocInfo("active-protyle");
        });
        this.eventBus.on("loaded-protyle-dynamic", ({ detail }) => {
            this.currentProtyle = detail?.protyle;
            this.updateDocInfo("loaded-protyle-dynamic");
        });
    }

    onunload() {
        this.eventBus.off("switch-protyle");
        this.eventBus.off("loaded-protyle-dynamic");
    }

    openSetting() {
        try {
            this.showPanel();
        } catch (err) {
            console.error("[siyuan-plugin-gitee-pages] openSetting failed:", err);
            showMessage("设置面板打开失败，已切换到简化面板", 3000, "warn");
            this.showFallbackPanel();
        }
    }

    showFallbackPanel() {
        const data = this.data[STORAGE_KEY] || (this.data[STORAGE_KEY] = {
            platform: "gitee",
            gitee: { repoPath: "", pagesUrl: "", siteTitle: "Notes" },
            github: { repoPath: "", pagesUrl: "", siteTitle: "Notes" },
            autoCommit: true,
            shares: [],
        });
        const plat = data.platform || "gitee";
        const currentPlatform = () => data.platform || "gitee";
        const setting = new Setting({ width: "560px" });

        setting.addItem({
            title: "仓库路径",
            description: "Pages 本地仓库路径",
            createActionElement: () => {
                const el = document.createElement("input");
                el.className = "b3-text-field fn__block";
                el.value = (data[plat] && data[plat].repoPath) || "";
                el.placeholder = plat === "github" ? "C:\\Users\\xxx\\github-pages" : "C:\\Users\\xxx\\gitee-pages";
                el.addEventListener("input", () => {
                    const key = currentPlatform();
                    const p = data[key] || (data[key] = {});
                    p.repoPath = el.value;
                    this.persistConfig(data);
                });
                return el;
            },
        });

        setting.addItem({
            title: "Pages URL",
            description: "发布后的访问地址",
            createActionElement: () => {
                const el = document.createElement("input");
                el.className = "b3-text-field fn__block";
                el.value = (data[plat] && data[plat].pagesUrl) || "";
                el.placeholder = plat === "github" ? "https://yourname.github.io" : "https://yourname.gitee.io";
                el.addEventListener("input", () => {
                    const key = currentPlatform();
                    const p = data[key] || (data[key] = {});
                    p.pagesUrl = el.value.replace(/\/+$/, "");
                    this.persistConfig(data);
                });
                return el;
            },
        });

        setting.addItem({
            title: "自动 Git 推送",
            description: "导出 HTML 后自动 commit 并 push",
            createActionElement: () => {
                const el = document.createElement("input");
                el.type = "checkbox";
                el.className = "b3-switch fn__flex-center";
                el.checked = data.autoCommit !== false;
                el.addEventListener("change", () => {
                    data.autoCommit = el.checked;
                    this.persistConfig(data);
                });
                return el;
            },
        });

        setting.open(this.displayName || "Pages 发布");
    }

    markSettingDialog() {
        try {
            const dialogs = Array.from(document.querySelectorAll(".b3-dialog__container"));
            const dialog = dialogs.reverse().find((item) => {
                const text = item.querySelector(".b3-dialog__header")?.textContent || "";
                return text.includes("Pages 发布");
            }) || dialogs[dialogs.length - 1];
            if (!dialog) return;
            dialog.classList.add("pp-setting-dialog");
            const container = dialog.querySelector(".config__tab-container");
            if (container) {
                container.classList.add("pp-content");
            }
            this.applySettingHelpIcons(dialog);
        } catch (err) {
            console.error("[siyuan-plugin-gitee-pages] markSettingDialog failed:", err);
        }
    }

    applySettingHelpIcons(dialog) {
        const helpMap = {
            "托管平台": "选择发布到 Gitee Pages 或 GitHub Pages",
            "本地仓库路径": "Pages 仓库在本地的克隆路径",
            "Pages URL": "发布后的访问地址",
            "站点标题": "HTML 页面顶部显示的站点名称",
            "自动 Git 推送": "导出 HTML 后自动 commit 并 push 到远程仓库",
        };
        try {
            const labels = Array.from(dialog.querySelectorAll(".b3-label.pp-field"));
            labels.forEach((label) => {
                const textWrap = label.querySelector(".b3-label__text");
                const titleNode = textWrap?.querySelector("span:first-child");
                if (!textWrap || !titleNode) return;
                const titleText = String(titleNode.textContent || "").trim();
                const helpText = helpMap[titleText];
                if (!helpText) return;
                if (titleNode.querySelector(".pp-help")) return;
                const help = document.createElement("span");
                help.className = "pp-help";
                help.textContent = "?";
                help.title = helpText;
                help.setAttribute("aria-label", helpText);
                textWrap.setAttribute("data-help-hidden", "true");
                titleNode.appendChild(help);
            });
        } catch (err) {
            console.error("[siyuan-plugin-gitee-pages] applySettingHelpIcons failed:", err);
        }
    }

    injectSettingStyle() {
        const id = "siyuan-pages-pub-setting-style";
        let style = document.getElementById(id);
        if (!style) {
            style = document.createElement("style");
            style.id = id;
            document.head.appendChild(style);
        }
        style.textContent = `
            .pp-setting-dialog {
                width: min(720px, 92vw) !important;
                height: min(82vh, 820px) !important;
                max-height: 82vh !important;
                min-height: 620px !important;
                display: flex !important;
                flex-direction: column !important;
            }
            .pp-setting-dialog .b3-dialog__header {
                flex: 0 0 auto !important;
            }
            .pp-setting-dialog .b3-dialog__body {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                display: flex !important;
                flex-direction: column !important;
            }
            .pp-setting-dialog .b3-dialog__content {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                padding: 18px 24px !important;
            }
            .pp-setting-dialog .pp-content,
            .pp-setting-dialog .b3-dialog__content > .config__tab-container {
                width: 100% !important;
                max-width: 640px !important;
                margin-left: auto !important;
                margin-right: auto !important;
                padding-bottom: 10px !important;
            }
            .config__tab-container .b3-label.pp-field {
                min-height: 0 !important;
                height: auto !important;
                padding: 9px 0 !important;
                align-items: center !important;
                margin: 0 !important;
            }
            .config__tab-container .b3-label.pp-field .b3-label__text {
                flex: 0 0 240px !important;
                min-width: 200px !important;
                margin: 0 !important;
            }
            .config__tab-container .b3-label.pp-field .b3-label__text > span {
                display: block;
            }
            .config__tab-container .b3-label.pp-field .b3-label__text > span:first-child {
                font-size: 13px;
                font-weight: 500;
                color: var(--b3-theme-on-surface);
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
            .config__tab-container .b3-label.pp-field .b3-label__text > :not(:first-child) {
                display: none !important;
            }
            .config__tab-container .b3-label.pp-field .b3-label__text > span:last-child {
                display: none !important;
                margin-top: 0 !important;
            }
            .config__tab-container .b3-label.pp-field .b3-label__action {
                flex: 1 1 auto !important;
                width: auto !important;
                min-width: 0 !important;
                max-width: none !important;
                margin-left: 14px !important;
            }
            .pp-help {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                margin-left: 6px;
                border-radius: 50%;
                font-size: 11px;
                line-height: 1;
                color: var(--b3-theme-on-surface-light);
                background: color-mix(in srgb, var(--b3-theme-surface) 80%, var(--b3-theme-background));
                border: 1px solid var(--b3-border-color);
                cursor: help;
                vertical-align: middle;
                flex: 0 0 auto;
            }
            .pp-help:hover {
                color: var(--b3-theme-primary);
                border-color: var(--b3-theme-primary);
                background: var(--b3-theme-primary-lightest);
            }
            .config__tab-container .b3-label.pp-field .b3-switch {
                margin-left: 0 !important;
            }
            .config__tab-container .b3-label.pp-section-card {
                border: 1px solid var(--b3-border-color) !important;
                border-radius: 12px !important;
                background: var(--b3-theme-surface) !important;
                padding: 14px 16px !important;
                margin: 0 0 14px !important;
            }
            .config__tab-container .b3-label.pp-section-share .b3-label__text {
                display: none !important;
            }
            .config__tab-container .b3-label.pp-section-share .b3-label__action {
                width: 100% !important;
                margin: 0 !important;
            }
            .config__tab-container .b3-label.pp-config-item {
                background: var(--b3-theme-surface) !important;
                margin: 0 !important;
                padding: 9px 14px !important;
                border-left: 1px solid var(--b3-border-color) !important;
                border-right: 1px solid var(--b3-border-color) !important;
                border-radius: 0 !important;
            }
            .config__tab-container .b3-label.pp-config-start {
                border-top: 1px solid var(--b3-border-color) !important;
                border-top-left-radius: 12px !important;
                border-top-right-radius: 12px !important;
                padding-top: 12px !important;
            }
            .config__tab-container .b3-label.pp-config-mid,
            .config__tab-container .b3-label.pp-config-end {
                border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 60%, transparent) !important;
            }
            .config__tab-container .b3-label.pp-config-end {
                border-bottom: 1px solid var(--b3-border-color) !important;
                border-bottom-left-radius: 12px !important;
                border-bottom-right-radius: 12px !important;
                padding-bottom: 12px !important;
                margin: 0 0 12px !important;
            }
            .config__tab-container .b3-label.pp-switch-row {
                align-items: center !important;
            }
            .config__tab-container .b3-label.pp-switch-row .b3-label__action {
                display: flex !important;
                justify-content: flex-end !important;
            }
            .pp-platform-cards {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }
            .pp-platform-card {
                min-width: 0;
                height: 38px;
                padding: 0 14px;
                border: 1px solid var(--b3-border-color);
                border-radius: 10px;
                cursor: pointer;
                transition: all .2s;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 13px;
                font-weight: 500;
                background: var(--b3-theme-background);
            }
            .pp-platform-card:hover {
                border-color: var(--b3-theme-primary-light);
                background: color-mix(in srgb, var(--b3-theme-primary-lightest) 72%, var(--b3-theme-background));
            }
            .pp-platform-card.active {
                border-color: color-mix(in srgb, var(--b3-theme-primary) 78%, var(--b3-theme-background));
                background: var(--b3-theme-primary-lightest);
                box-shadow: 0 0 0 1px color-mix(in srgb, var(--b3-theme-primary) 32%, transparent);
            }
            .pp-platform-card .pp-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: var(--b3-border-color);
                flex-shrink: 0;
                transition: background .2s;
            }
            .pp-platform-card.active .pp-dot {
                background: var(--b3-theme-primary);
                box-shadow: 0 0 0 3px var(--b3-theme-primary-lightest);
            }
            .pp-platform-card .pp-name {
                font-size: 13px;
                font-weight: 600;
            }
            .pp-input {
                width: 100%;
                height: 36px;
                padding: 0 12px;
                font-size: 13px;
                border: 1.5px solid var(--b3-border-color);
                border-radius: 8px;
                background: var(--b3-theme-background);
                color: var(--b3-theme-on-surface);
                outline: none;
                transition: border-color .2s, box-shadow .2s;
                font-family: inherit;
            }
            .pp-input:hover {
                border-color: var(--b3-theme-primary-light);
            }
            .pp-input:focus {
                border-color: var(--b3-theme-primary);
                box-shadow: 0 0 0 3px var(--b3-theme-primary-lightest);
            }
            .pp-input::placeholder {
                color: var(--b3-theme-on-surface-light);
                opacity: .4;
            }
            .pp-publish-btn {
                height: 36px;
                padding: 0 14px;
                font-size: 13px;
                font-weight: 600;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                color: #fff;
                background: linear-gradient(135deg, var(--b3-theme-primary), color-mix(in srgb, var(--b3-theme-primary) 70%, #000));
                box-shadow: 0 2px 10px rgba(0,0,0,.08);
                transition: all .25s;
                text-align: center;
            }
            .pp-setting-dialog .pp-publish-row {
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                padding: 8px 0 10px !important;
                margin: 0 0 10px !important;
                border-bottom: 0 !important;
            }
            .pp-setting-dialog .pp-publish-row .pp-publish-button,
            .pp-setting-dialog .pp-publish-button {
                width: 168px !important;
                min-width: 168px !important;
                max-width: 168px !important;
                flex: 0 0 168px !important;
                height: 36px !important;
                padding: 0 14px !important;
                box-sizing: border-box !important;
                text-align: center !important;
            }
            .pp-publish-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 18px rgba(0,0,0,.12);
            }
            .pp-publish-btn:active {
                transform: translateY(0);
            }
            .pp-publish-btn:disabled {
                opacity: .5;
                cursor: not-allowed;
                transform: none;
            }
            .pp-setting-dialog .b3-label.pp-publish-row-host {
                border-bottom: 0 !important;
                margin: 0 0 10px !important;
                padding: 8px 0 10px !important;
                background: transparent !important;
                border-left: 0 !important;
                border-right: 0 !important;
                border-top: 0 !important;
                border-radius: 0 !important;
            }
            .config__tab-container .b3-label.pp-publish-row-host .b3-label__text {
                display: none !important;
            }
            .config__tab-container .b3-label.pp-publish-row-host .b3-label__action {
                width: 100% !important;
                margin: 0 !important;
            }
            .pp-share-panel {
                border: 1px solid var(--b3-border-color);
                border-radius: 12px;
                background: var(--b3-theme-surface);
                width: 100%;
                max-width: 640px !important;
                margin-left: auto !important;
                margin-right: auto !important;
                box-sizing: border-box !important;
                padding: 14px 16px;
            }
            .pp-share-head {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 12px;
                flex-wrap: wrap;
            }
            .pp-share-toolbar {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 10px;
                flex: 1 1 320px;
                min-width: 0;
                flex-wrap: wrap;
            }
            .pp-share-title {
                font-size: 15px;
                font-weight: 600;
                color: var(--b3-theme-on-surface);
            }
            .pp-share-title-row {
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
            }
            .pp-share-count {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 28px;
                height: 22px;
                padding: 0 8px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 500;
                color: var(--b3-theme-on-surface-light);
                background: color-mix(in srgb, var(--b3-theme-surface) 78%, var(--b3-theme-background));
                border: 1px solid var(--b3-border-color);
                flex: 0 0 auto;
            }
            .pp-share-refresh,
            .pp-share-btn {
                border: 1px solid var(--b3-border-color);
                background: var(--b3-theme-background);
                color: var(--b3-theme-on-background);
                border-radius: 8px;
                padding: 6px 10px;
                font-size: 12px;
                cursor: pointer;
                transition: all .2s;
            }
            .pp-share-refresh:hover,
            .pp-share-btn:hover {
                border-color: var(--b3-theme-primary);
                color: var(--b3-theme-primary);
            }
            .pp-share-refresh:disabled,
            .pp-share-btn:disabled {
                opacity: .55;
                cursor: not-allowed;
            }
            .pp-share-search {
                width: 240px;
                max-width: 100%;
                min-width: 180px;
                padding: 8px 12px;
                border: 1px solid var(--b3-border-color);
                border-radius: 999px;
                background: color-mix(in srgb, var(--b3-theme-surface) 82%, var(--b3-theme-background));
                color: var(--b3-theme-on-surface);
                font-size: 12px;
                outline: none;
                transition: border-color .2s, box-shadow .2s, background .2s;
            }
            .pp-share-search:hover {
                border-color: var(--b3-theme-primary-light);
            }
            .pp-share-search:focus {
                border-color: var(--b3-theme-primary);
                box-shadow: 0 0 0 3px var(--b3-theme-primary-lightest);
                background: var(--b3-theme-surface);
            }
            .pp-share-empty {
                height: 72px;
                padding: 0 12px;
                border: 1px dashed var(--b3-border-color);
                border-radius: 10px;
                color: var(--b3-theme-on-surface-light);
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                font-size: 13px;
            }
            .pp-share-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .pp-share-body {
                max-height: none;
                overflow: visible;
                padding-right: 0;
            }
            .pp-share-card {
                border: 1px solid var(--b3-border-color);
                border-radius: 12px;
                background: var(--b3-theme-background);
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .pp-share-card-head {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                align-items: flex-start;
            }
            .pp-share-card-title {
                font-size: 14px;
                font-weight: 600;
                line-height: 1.5;
                color: var(--b3-theme-on-background);
                word-break: break-word;
            }
            .pp-share-card-time {
                flex: 0 0 auto;
                font-size: 12px;
                color: var(--b3-theme-on-surface-light);
                white-space: nowrap;
            }
            .pp-share-card-meta {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                font-size: 12px;
                color: var(--b3-theme-on-surface-light);
            }
            .pp-share-chip {
                display: inline-flex;
                align-items: center;
                padding: 2px 8px;
                border-radius: 999px;
                background: var(--b3-theme-primary-lightest);
                color: var(--b3-theme-primary);
            }
            .pp-share-grid {
                display: grid;
                grid-template-columns: minmax(88px, 104px) 1fr;
                gap: 8px 10px;
                font-size: 12px;
                line-height: 1.5;
            }
            .pp-share-grid-label {
                color: var(--b3-theme-on-surface-light);
            }
            .pp-share-grid-value {
                color: var(--b3-theme-on-background);
                word-break: break-all;
            }
            .pp-share-grid-value--link {
                min-width: 0;
            }
            .pp-share-url-link {
                display: block;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: var(--b3-theme-primary);
                font-size: 12px;
                text-decoration: none;
            }
            .pp-share-url-link:hover {
                text-decoration: underline;
            }
            .pp-share-url-link:focus-visible {
                outline: 2px solid var(--b3-theme-primary);
                outline-offset: 2px;
                border-radius: 4px;
            }
            .pp-share-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .pp-share-btn-danger:hover {
                border-color: var(--b3-theme-error, #d23f31);
                color: var(--b3-theme-error, #d23f31);
            }
            @media (max-width: 840px) {
                .config__tab-container .b3-label.pp-field {
                    align-items: flex-start !important;
                }
                .config__tab-container .b3-label.pp-field .b3-label__text {
                    flex: none !important;
                    min-width: 0 !important;
                    margin-bottom: 8px !important;
                }
                .config__tab-container .b3-label.pp-field .b3-label__action {
                    width: 100% !important;
                    margin-left: 0 !important;
                }
                .pp-platform-cards {
                    grid-template-columns: 1fr 1fr;
                }
                .pp-share-head,
                .pp-share-card-head {
                    flex-direction: column;
                    align-items: stretch;
                }
                .pp-share-toolbar {
                    width: 100%;
                    justify-content: stretch;
                    flex-wrap: wrap;
                }
                .pp-share-search {
                    width: 100%;
                    min-width: 0;
                }
                .pp-share-grid {
                    grid-template-columns: 1fr;
                }
                .pp-share-card-time {
                    white-space: normal;
                }
            }
            @media (max-width: 720px) {
                .pp-setting-dialog {
                    width: 96vw !important;
                    height: 90vh !important;
                    max-height: 90vh !important;
                    min-height: 0 !important;
                }
                .pp-setting-dialog .b3-dialog__content {
                    padding: 14px !important;
                }
                .pp-platform-cards {
                    grid-template-columns: 1fr;
                }
                .pp-share-toolbar {
                    flex-direction: column;
                    align-items: stretch;
                }
                .pp-setting-dialog .pp-publish-row .pp-publish-button,
                .pp-setting-dialog .pp-publish-button {
                    width: 168px !important;
                    min-width: 168px !important;
                    max-width: 168px !important;
                    flex: 0 0 168px !important;
                }
            }
        `;
    }

    updateDocInfo(source = "active-protyle") {
        this.refreshLastActiveDocInfo(source).catch(() => {});
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    normalizeDocInfo(info, source = "fallback") {
        const docId = String(info?.docId || "").trim();
        const title = String(info?.title || "").trim();
        return {
            docId,
            title,
            source: String(info?.source || source || "fallback"),
        };
    }

    applyCurrentDocInfo(info, options = {}) {
        const normalized = this.normalizeDocInfo(info, info?.source || "fallback");
        if (!normalized.docId) return normalized;
        this.currentDocId = normalized.docId;
        if (normalized.title) this.currentDocTitle = normalized.title;
        const shouldCache = options.cache !== false;
        if (shouldCache) {
            this.lastActiveDocInfo = {
                docId: normalized.docId,
                title: normalized.title || this.currentDocTitle || normalized.docId,
                updatedAt: Date.now(),
                source: normalized.source,
            };
        }
        return normalized;
    }

    getDocTitleFromProtyle(protyle) {
        if (!protyle) return "";
        const block = protyle.block || protyle.model || {};
        const directTitle = block.title || block.name || protyle.title || protyle.docTitle;
        if (directTitle) return String(directTitle).trim();
        const element = protyle.element || protyle.protyle?.element || protyle.wysiwyg?.element;
        if (!element || typeof element.querySelector !== "function") return "";
        const selectors = [
            ".protyle-title__input",
            ".protyle-background__title",
            "[data-type='NodeDocument'] .protyle-title__input",
        ];
        for (const selector of selectors) {
            const node = element.querySelector(selector);
            const value = String(node?.textContent || node?.value || "").trim();
            if (value) return value;
        }
        return "";
    }

    getDocIdFromElement(element) {
        if (!element || typeof element.closest !== "function") return "";
        const candidates = [
            element,
            element.closest("[data-doc-id]"),
            element.closest("[data-root-id]"),
            element.closest("[data-node-id]"),
            element.closest(".protyle"),
            element.closest(".layout-tab-container"),
        ].filter(Boolean);
        for (const node of candidates) {
            const values = [
                node.getAttribute?.("data-doc-id"),
                node.getAttribute?.("data-root-id"),
                node.getAttribute?.("data-node-id"),
                node.dataset?.docId,
                node.dataset?.rootId,
                node.dataset?.nodeId,
                node.dataset?.id,
            ].filter(Boolean);
            const docId = values.find((value) => /^\d{14}-[a-z0-9]+$/i.test(String(value).trim())) || values[0];
            if (docId) return String(docId).trim();
        }
        return "";
    }

    getCurrentTitleFromDOM() {
        const selectors = [
            ".layout__wnd--active .protyle-title__input",
            ".layout__wnd--active .protyle-background__title",
            ".item--focus .item__text",
            ".layout-tab-bar .item--focus",
        ];
        for (const selector of selectors) {
            const node = document.querySelector(selector);
            const value = String(node?.value || node?.textContent || node?.getAttribute?.("aria-label") || "").trim();
            if (value) return value;
        }
        return "";
    }

    extractDocInfoFromProtyle(protyle, source = "active-protyle") {
        if (!protyle) return this.normalizeDocInfo({}, source);
        const block = protyle.block || protyle.model || {};
        const element = protyle.element || protyle.protyle?.element || protyle.wysiwyg?.element || null;
        const docId = String(
            block.rootID || block.rootId || block.id || protyle.rootID || protyle.rootId || this.getDocIdFromElement(element) || "",
        ).trim();
        const title = this.getDocTitleFromProtyle(protyle) || this.getCurrentTitleFromDOM() || "";
        return this.normalizeDocInfo({ docId, title, source }, source);
    }

    getCurrentDocInfoFromSelection() {
        const selectors = [
            ".layout__wnd--active .protyle-wysiwyg [data-node-id].protyle-wysiwyg--select",
            ".layout__wnd--active .protyle-wysiwyg [data-node-id].protyle-wysiwyg--hl",
            ".layout__wnd--active .protyle-wysiwyg [data-node-id][contenteditable='true']",
            ".layout__wnd--active .protyle-wysiwyg [data-node-id]",
        ];
        for (const selector of selectors) {
            const node = document.querySelector(selector);
            const docId = this.getDocIdFromElement(node);
            if (!docId) continue;
            return this.normalizeDocInfo({
                docId,
                title: this.getCurrentTitleFromDOM(),
                source: "selected-block",
            }, "selected-block");
        }
        return this.normalizeDocInfo({}, "selected-block");
    }

    getCurrentDocInfoFromTab() {
        const selectors = [
            ".layout__wnd--active .item--focus[data-id]",
            ".layout-tab-bar .item--focus[data-id]",
            ".layout__wnd--active [data-activetime][data-id]",
        ];
        for (const selector of selectors) {
            const node = document.querySelector(selector);
            if (!node) continue;
            const rawId = String(node.getAttribute("data-id") || node.dataset?.id || "").trim();
            if (!rawId) continue;
            const docIdMatch = rawId.match(/\d{14}-[a-z0-9]+/i);
            if (!docIdMatch) continue;
            const docId = docIdMatch[0];
            const title = String(
                node.getAttribute("title")
                || node.getAttribute("aria-label")
                || (typeof node.querySelector === "function" ? node.querySelector(".item__text")?.textContent : "")
                || node.textContent
                || "",
            ).trim();
            if (docId) return this.normalizeDocInfo({ docId, title, source: "tab-dom" }, "tab-dom");
        }
        return this.normalizeDocInfo({}, "tab-dom");
    }

    getCurrentDocInfoFromSiyuanLayout() {
        const siyuan = globalThis.window?.siyuan;
        if (!siyuan) return this.normalizeDocInfo({}, "siyuan-layout");
        const protyles = [];
        const push = (item) => {
            if (!item) return;
            if (Array.isArray(item)) {
                item.forEach(push);
                return;
            }
            protyles.push(item);
        };
        push(siyuan.mobile?.editor?.protyle);
        push(siyuan.editor?.protyle);
        push(siyuan.editor?.protyles);
        push(siyuan.protyle);
        for (const protyle of protyles) {
            const info = this.extractDocInfoFromProtyle(protyle, "siyuan-layout");
            if (info.docId) return info;
        }
        return this.normalizeDocInfo({}, "siyuan-layout");
    }

    async readDocMetaById(docId) {
        const id = String(docId || "").trim();
        if (!id) return null;
        try {
            const result = await fetchSyncPost("/api/block/getBlockInfo", { id });
            if (!result || result.code !== 0 || !result.data) return null;
            const data = result.data || {};
            const title = String(
                data.rootTitle || data.title || data.name || data.pathName || data.hPath || "",
            ).trim();
            const rootID = String(data.rootID || data.rootId || data.id || id).trim();
            return { docId: rootID || id, title };
        } catch (err) {
            console.error("[siyuan-plugin-gitee-pages] readDocMetaById failed:", err);
            return null;
        }
    }

    async enrichDocInfo(info) {
        const normalized = this.normalizeDocInfo(info, info?.source || "fallback");
        if (!normalized.docId) return normalized;
        const meta = await this.readDocMetaById(normalized.docId);
        if (meta?.docId) {
            return this.normalizeDocInfo({
                docId: meta.docId,
                title: meta.title || normalized.title || this.getCurrentTitleFromDOM() || meta.docId,
                source: normalized.source,
            }, normalized.source);
        }
        if (normalized.title) return normalized;
        const domTitle = this.getCurrentTitleFromDOM();
        if (domTitle) return this.normalizeDocInfo({ ...normalized, title: domTitle }, normalized.source);
        return this.normalizeDocInfo({ ...normalized, title: normalized.docId }, normalized.source);
    }

    isLastActiveDocInfoStale(info = this.lastActiveDocInfo) {
        const updatedAt = Number(info?.updatedAt || 0);
        return !updatedAt || (Date.now() - updatedAt > 30 * 60 * 1000);
    }

    async getValidatedLastActiveDocInfo() {
        const cached = this.lastActiveDocInfo || {};
        if (!cached.docId) return this.normalizeDocInfo({}, "cached-current-doc");
        const meta = await this.readDocMetaById(cached.docId);
        if (!meta?.docId) return this.normalizeDocInfo({}, "cached-current-doc");
        return this.normalizeDocInfo({
            docId: meta.docId,
            title: meta.title || cached.title || meta.docId,
            source: "cached-current-doc",
        }, "cached-current-doc");
    }

    async getCurrentDocInfoSafe(options = {}) {
        const allowCache = options.allowCache !== false;
        const steps = [
            () => this.extractDocInfoFromProtyle(this.currentProtyle, "active-protyle"),
            () => this.getCurrentDocInfoFromSelection(),
            () => this.getCurrentDocInfoFromTab(),
            () => this.getCurrentDocInfoFromSiyuanLayout(),
        ];
        for (const read of steps) {
            const info = await this.enrichDocInfo(read());
            if (info.docId) {
                this.applyCurrentDocInfo(info);
                return info;
            }
        }
        if (allowCache) {
            const cached = await this.getValidatedLastActiveDocInfo();
            if (cached.docId) {
                this.applyCurrentDocInfo(cached);
                return cached;
            }
        }
        return this.normalizeDocInfo({}, "fallback");
    }

    async refreshLastActiveDocInfo(source = "active-protyle") {
        const info = await this.getCurrentDocInfoSafe({ allowCache: false });
        if (info.docId) {
            return this.applyCurrentDocInfo({ ...info, source });
        }
        return info;
    }

    // 获取当前平台配置
    currentConfig(platform) {
        const d = this.data[STORAGE_KEY];
        const p = platform === "github" ? "github" : (platform || d.platform || "gitee");
        const pc = d[p] || {};
        return {
            platform: p,
            repoPath: pc.repoPath || "",
            pagesUrl: (pc.pagesUrl || "").replace(/\/+$/, ""),
            siteTitle: pc.siteTitle || "Notes",
            autoCommit: d.autoCommit !== false,
        };
    }

    getShareRecords() {
        const cfg = this.data[STORAGE_KEY] || this.defaultConfig();
        const shares = Array.isArray(cfg.shares) ? cfg.shares : [];
        return shares
            .map((item) => this.normalizeShareRecord(item))
            .filter(Boolean)
            .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    }

    upsertShareRecord(record) {
        const normalized = this.normalizeShareRecord(record);
        if (!normalized) return null;
        const data = this.data[STORAGE_KEY] || this.defaultConfig();
        const shares = Array.isArray(data.shares) ? data.shares.slice() : [];
        const existingIndex = shares.findIndex((item) => item && item.docId === normalized.docId && item.platform === normalized.platform);
        if (existingIndex >= 0) {
            const existing = this.normalizeShareRecord(shares[existingIndex]);
            shares[existingIndex] = {
                ...existing,
                ...normalized,
                id: existing.id || normalized.id,
                createdAt: existing.createdAt || normalized.createdAt,
                updatedAt: normalized.updatedAt || new Date().toISOString(),
            };
        } else {
            shares.push({
                ...normalized,
                id: normalized.id || `${normalized.platform}-${Date.now()}`,
                createdAt: normalized.createdAt || new Date().toISOString(),
                updatedAt: normalized.updatedAt || new Date().toISOString(),
            });
        }
        data.shares = shares;
        this.persistConfig(data);
        return shares[existingIndex >= 0 ? existingIndex : shares.length - 1];
    }

    removeShareRecord(id) {
        const data = this.data[STORAGE_KEY] || this.defaultConfig();
        const shares = Array.isArray(data.shares) ? data.shares.slice() : [];
        const nextShares = shares.filter((item) => item?.id !== id);
        data.shares = nextShares;
        this.persistConfig(data);
    }

    // 显示设置+发布面板
    showPanel() {
        const data = this.data[STORAGE_KEY];
        const that = this;
        const refs = {};
        const plat = data.platform || "gitee";
        const currentPlatform = () => data.platform || "gitee";

        this.refreshLastActiveDocInfo("panel-open").catch(() => {});
        this.injectSettingStyle();

        this.setting = new Setting({ width: "min(720px, 92vw)", height: "min(82vh, 820px)" });

        // ── 平台选择 ──
        this.setting.addItem({
            title: "托管平台",
            description: "",
            direction: "row",
            className: "pp-field pp-section-card pp-section-platform",
            createActionElement: () => {
                const wrap = document.createElement("div");
                wrap.className = "pp-platform-cards";
                const card = (val, name, isActive) => {
                    const el = document.createElement("div");
                    el.className = "pp-platform-card" + (isActive ? " active" : "");
                    el.innerHTML = `<span class="pp-dot"></span><span class="pp-name">${name}</span>`;
                    el.addEventListener("click", () => {
                        data.platform = val; that.persistConfig(data);
                        wrap.querySelectorAll(".pp-platform-card").forEach(c => c.classList.remove("active"));
                        el.classList.add("active");
                        const pc = data[val] || {};
                        if (refs.repo) { refs.repo.value = pc.repoPath || ""; refs.repo.placeholder = val==="github"?"C:\\Users\\xxx\\github-pages":"C:\\Users\\xxx\\gitee-pages"; }
                        if (refs.url)  { refs.url.value  = pc.pagesUrl || "";  refs.url.placeholder  = val==="github"?"https://yourname.github.io":"https://yourname.gitee.io"; }
                        if (refs.title) refs.title.value = pc.siteTitle || "Notes";
                    });
                    return el;
                };
                wrap.appendChild(card("gitee", "Gitee Pages", plat === "gitee"));
                wrap.appendChild(card("github", "GitHub Pages", plat === "github"));
                return wrap;
            },
        });

        // ── 仓库路径 ──
        this.setting.addItem({
            title: "本地仓库路径",
            description: "",
            direction: "row",
            className: "pp-field pp-config-item pp-config-start",
            createActionElement: () => {
                const el = document.createElement("input");
                el.className = "pp-input";
                const pc = data[plat] || {};
                el.value = pc.repoPath || "";
                el.placeholder = plat === "github" ? "C:\\Users\\xxx\\github-pages" : "C:\\Users\\xxx\\gitee-pages";
                el.spellcheck = false;
                el.addEventListener("input", () => { const key=currentPlatform(); const p=data[key]||(data[key]={}); p.repoPath=el.value; that.persistConfig(data); });
                refs.repo = el;
                return el;
            },
        });

        // ── Pages URL ──
        this.setting.addItem({
            title: "Pages URL",
            description: "",
            direction: "row",
            className: "pp-field pp-config-item pp-config-mid",
            createActionElement: () => {
                const el = document.createElement("input");
                el.className = "pp-input";
                const pc = data[plat] || {};
                el.value = pc.pagesUrl || "";
                el.placeholder = plat === "github" ? "https://yourname.github.io" : "https://yourname.gitee.io";
                el.spellcheck = false;
                el.addEventListener("input", () => { const key=currentPlatform(); const p=data[key]||(data[key]={}); p.pagesUrl=el.value.replace(/\/+$/,""); that.persistConfig(data); });
                refs.url = el;
                return el;
            },
        });

        // ── 站点标题 ──
        this.setting.addItem({
            title: "站点标题",
            description: "",
            direction: "row",
            className: "pp-field pp-config-item pp-config-mid",
            createActionElement: () => {
                const el = document.createElement("input");
                el.className = "pp-input";
                const pc = data[plat] || {};
                el.value = pc.siteTitle || "Notes";
                el.placeholder = "My Notes";
                el.spellcheck = false;
                el.addEventListener("input", () => { const key=currentPlatform(); const p=data[key]||(data[key]={}); p.siteTitle=el.value; that.persistConfig(data); });
                refs.title = el;
                return el;
            },
        });

        // ── 自动推送 ──
        this.setting.addItem({
            title: "自动 Git 推送",
            description: "",
            className: "pp-field pp-config-item pp-config-end pp-switch-row",
            createActionElement: () => {
                const inp = document.createElement("input");
                inp.type = "checkbox";
                inp.className = "b3-switch fn__flex-center";
                inp.checked = data.autoCommit !== false;
                inp.addEventListener("change", () => { data.autoCommit=inp.checked; that.persistConfig(data); });
                return inp;
            },
        });

        // ── 发布按钮 ──
        this.setting.addItem({
            title: "", description: "",
            className: "pp-publish-row-host",
            createActionElement: () => {
                const btn = document.createElement("button");
                btn.className = "pp-publish-btn pp-publish-button";
                btn.textContent = "发布当前文档";
                btn.addEventListener("click", async () => {
                    if (that.publishTask) {
                        showMessage("已有发布任务正在后台运行", 2500, "info");
                        return;
                    }
                    btn.textContent = "后台发布中…";
                    btn.disabled = true;
                    await that.refreshLastActiveDocInfo("panel-publish-click").catch(() => {});
                    that.runPublishInBackground();
                });
                const wrap = document.createElement("div");
                wrap.className = "pp-publish-row";
                wrap.appendChild(btn);
                return wrap;
            },
        });

        this.setting.addItem({
            title: "",
            description: "",
            direction: "row",
            className: "pp-field pp-section-share",
            createActionElement: () => {
                const wrap = this.buildShareListElement();
                this.renderShareList(wrap);
                return wrap;
            },
        });

        this.setting.open(this.displayName || "Pages 发布");
        requestAnimationFrame(() => this.markSettingDialog());
        setTimeout(() => this.markSettingDialog(), 80);
    }

    buildShareListElement() {
        const wrap = document.createElement("div");
        wrap.className = "pp-share-panel";
        wrap._ppSearchQuery = "";

        const head = document.createElement("div");
        head.className = "pp-share-head";

        const titleWrap = document.createElement("div");
        titleWrap.innerHTML = `<div class="pp-share-title-row"><div class="pp-share-title">分享列表</div><span class="pp-share-count">0 条</span><span class="pp-help" title="发布成功后会自动记录到这里，可对历史分享执行复制、更新、打开目录、删除。" aria-label="发布成功后会自动记录到这里，可对历史分享执行复制、更新、打开目录、删除。">?</span></div>`;

        const toolbar = document.createElement("div");
        toolbar.className = "pp-share-toolbar";

        const searchInput = document.createElement("input");
        searchInput.type = "search";
        searchInput.className = "pp-share-search";
        searchInput.placeholder = "搜索文档标题";
        searchInput.spellcheck = false;
        searchInput.addEventListener("input", () => {
            wrap._ppSearchQuery = searchInput.value || "";
            this.renderShareList(wrap);
        });

        const refreshBtn = document.createElement("button");
        refreshBtn.className = "pp-share-refresh";
        refreshBtn.textContent = "刷新";
        refreshBtn.addEventListener("click", () => this.renderShareList(wrap));

        head.appendChild(titleWrap);
        toolbar.appendChild(searchInput);
        toolbar.appendChild(refreshBtn);
        head.appendChild(toolbar);

        const body = document.createElement("div");
        body.className = "pp-share-body";

        wrap.appendChild(head);
        wrap.appendChild(body);
        return wrap;
    }

    renderShareList(container) {
        if (!container) return;
        const body = container.querySelector(".pp-share-body");
        const countEl = container.querySelector(".pp-share-count");
        if (!body) return;
        body.innerHTML = "";

        const keyword = String(container._ppSearchQuery || "").trim().toLocaleLowerCase();
        const totalRecords = this.getShareRecords();
        const records = totalRecords.filter((record) => {
            if (!keyword) return true;
            return String(record.title || "").toLocaleLowerCase().includes(keyword);
        });
        if (countEl) {
            countEl.textContent = keyword ? `${records.length} / ${totalRecords.length} 条` : `${totalRecords.length} 条`;
        }
        if (!records.length) {
            const empty = document.createElement("div");
            empty.className = "pp-share-empty";
            empty.textContent = keyword ? "未找到匹配的分享文档" : "暂无分享记录";
            body.appendChild(empty);
            return;
        }

        const list = document.createElement("div");
        list.className = "pp-share-list";
        records.forEach((record) => list.appendChild(this.createShareCard(record, container)));
        body.appendChild(list);
    }

    createShareCard(record, container) {
        const card = document.createElement("div");
        card.className = "pp-share-card";

        const safeUpdated = this.formatDateTime(record.updatedAt);
        const safeUrl = String(record.url || "").trim();
        const linkHtml = safeUrl
            ? `<a class="pp-share-url-link" href="${this.escAttr(safeUrl)}" title="${this.escAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">${this.esc(safeUrl)}</a>`
            : `<span class="pp-share-grid-value">-</span>`;
        card.innerHTML = `
            <div class="pp-share-card-head">
                <div>
                    <div class="pp-share-card-title">${this.esc(record.title)}</div>
                    <div class="pp-share-card-meta">
                        <span class="pp-share-chip">${record.platform}</span>
                    </div>
                </div>
                <div class="pp-share-card-time">更新时间 ${this.esc(safeUpdated)}</div>
            </div>
            <div class="pp-share-grid">
                <div class="pp-share-grid-label">文档 ID</div>
                <div class="pp-share-grid-value">${this.esc(record.docId)}</div>
                <div class="pp-share-grid-label">仓库路径</div>
                <div class="pp-share-grid-value">${this.esc(record.repoPath)}</div>
                <div class="pp-share-grid-label">访问链接</div>
                <div class="pp-share-grid-value pp-share-grid-value--link">${linkHtml}</div>
            </div>
        `;

        const actions = document.createElement("div");
        actions.className = "pp-share-actions";

        const copyBtn = this.createShareActionButton("复制链接", async () => {
            await this.copyShareUrl(record.url);
        });
        const updateBtn = this.createShareActionButton("更新分享", async () => {
            await this.updateShare(record);
            this.renderShareList(container);
        });
        const openBtn = this.createShareActionButton("打开本地目录", async () => {
            await this.openLocalPath(path.join(record.repoPath, record.slug));
        });
        const deleteBtn = this.createShareActionButton("删除分享", async () => {
            await this.deleteShare(record);
            this.renderShareList(container);
        }, "pp-share-btn-danger");

        actions.appendChild(copyBtn);
        actions.appendChild(updateBtn);
        actions.appendChild(openBtn);
        actions.appendChild(deleteBtn);
        card.appendChild(actions);
        return card;
    }

    createShareActionButton(label, handler, extraClass = "") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `pp-share-btn${extraClass ? ` ${extraClass}` : ""}`;
        btn.textContent = label;
        btn.addEventListener("click", async () => {
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = "处理中...";
            try {
                await handler();
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        });
        return btn;
    }

    async copyShareUrl(url) {
        if (!url) {
            showMessage("该记录没有可复制的访问链接", 3000, "warn");
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            showMessage("链接已复制", 2000, "info");
        } catch (err) {
            console.error("[siyuan-plugin-gitee-pages] copyShareUrl failed:", err);
            showMessage("复制链接失败，请检查剪贴板权限", 4000, "error");
        }
    }


    runPublishInBackground() {
        this.closePublishPanel();
        this.runExclusiveTask(() => this.publish());
    }

    runExclusiveTask(task) {
        if (this.publishTask) {
            showMessage("已有发布任务正在后台运行，请稍后再试", 3000, "info");
            return this.publishTask;
        }
        this.publishTask = Promise.resolve()
            .then(() => task())
            .finally(() => { this.publishTask = null; });
        return this.publishTask;
    }

    closePublishPanel() {
        try {
            if (typeof this.setting?.close === "function") { this.setting.close(); return; }
            if (typeof this.setting?.destroy === "function") { this.setting.destroy(); return; }
            if (typeof this.setting?.dialog?.destroy === "function") { this.setting.dialog.destroy(); return; }
        } catch (e) { /* fallback below */ }
        try {
            const dialogs = Array.from(document.querySelectorAll(".b3-dialog, .b3-dialog__container"));
            const dialog = dialogs.reverse().find((el) => /Pages 发布|发布当前文档|GitHub Pages|Gitee Pages/.test(el.textContent || ""));
            dialog?.remove();
        } catch (e) { /* ignore */ }
    }

    setProgress(percent, text) {
        const p = Math.max(0, Math.min(100, Math.round(percent)));
        if (!this.progressEl) {
            const el = document.createElement("div");
            el.id = "pages-pub-progress";
            el.innerHTML = `<div class="pp-progress-title">Pages 发布</div><div class="pp-progress-text"></div><div class="pp-progress-track"><div class="pp-progress-bar"></div></div><div class="pp-progress-percent"></div>`;
            el.style.cssText = "position:fixed;right:24px;bottom:24px;z-index:99999;width:320px;padding:14px 16px;border-radius:10px;background:var(--b3-theme-surface,#fff);color:var(--b3-theme-on-surface,#222);box-shadow:0 8px 28px rgba(0,0,0,.22);font-size:13px;";
            const style = document.createElement("style");
            style.textContent = `
#pages-pub-progress .pp-progress-title{font-weight:700;margin-bottom:8px}
#pages-pub-progress .pp-progress-text{line-height:1.45;margin-bottom:10px;word-break:break-all}
#pages-pub-progress .pp-progress-track{height:8px;border-radius:999px;overflow:hidden;background:var(--b3-theme-background-light,#e8e8e8)}
#pages-pub-progress .pp-progress-bar{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#ff8a70,#c76552);transition:width .25s ease}
#pages-pub-progress .pp-progress-percent{margin-top:6px;text-align:right;color:var(--b3-theme-on-surface-light,#777)}
`;
            el.appendChild(style);
            document.body.appendChild(el);
            this.progressEl = el;
        }
        this.progressEl.querySelector(".pp-progress-text").textContent = text;
        this.progressEl.querySelector(".pp-progress-bar").style.width = `${p}%`;
        this.progressEl.querySelector(".pp-progress-percent").textContent = `${p}%`;
    }

    finishProgress(text, isError = false) {
        this.setProgress(isError ? 100 : 100, text);
        if (this.progressEl) {
            this.progressEl.querySelector(".pp-progress-bar").style.background = isError ? "#d23f31" : "#2ea043";
        }
        setTimeout(() => {
            this.progressEl?.remove();
            this.progressEl = null;
        }, isError ? 8000 : 3500);
    }

    // === 发布 ===
    async publish() {
        let docInfo = await this.getCurrentDocInfoSafe({ allowCache: false });
        if (!docInfo.docId) {
            await this.sleep(100);
            docInfo = await this.getCurrentDocInfoSafe({ allowCache: false });
        }
        if (!docInfo.docId) {
            docInfo = await this.getValidatedLastActiveDocInfo();
        }
        console.debug("[Pages Publisher] current doc info:", docInfo);
        if (!docInfo.docId) {
            const hasCachedDoc = !!this.lastActiveDocInfo?.docId;
            const stale = hasCachedDoc && this.isLastActiveDocInfoStale();
            const message = stale
                ? "未能确认当前打开文档，请重新点击正文后再发布"
                : "请先打开一篇笔记后再发布";
            this.finishProgress(`发布失败：${message}`, true);
            showMessage(message, 3500, "warn");
            return;
        }
        this.applyCurrentDocInfo(docInfo);

        try {
            await this.publishDoc({
                docId: docInfo.docId,
                title: docInfo.title || this.currentDocTitle || docInfo.docId || "Untitled",
                platform: this.currentConfig().platform,
                source: "current",
            });
        } catch (err) {
            this.finishProgress(`发布失败: ${this.formatError(err)}`, true);
            if (!err?._pagesMessageShown) {
                showMessage(`失败: ${this.formatError(err)}`, 5000, "error");
            }
            console.error(err);
        }
    }

    async publishByDocId(docId, options = {}) {
        if (!docId) throw new Error("缺少文档 ID");
        return this.runExclusiveTask(() => this.publishDoc({
            docId,
            title: options.title || "Untitled",
            forceSlug: options.forceSlug,
            platform: options.platform,
            source: "share",
        }));
    }

    async publishDoc({ docId, title, forceSlug, platform, source = "current" }) {
        const cfg = this.currentConfig(platform);
        this.setProgress(3, "检查发布配置...");

        if (!cfg.repoPath) {
            this.finishProgress("发布失败：请先填写仓库路径", true);
            showMessage("请先填写仓库路径", 3000, "warn");
            return null;
        }
        if (!fs.existsSync(cfg.repoPath)) {
            this.finishProgress(`发布失败：路径不存在 ${cfg.repoPath}`, true);
            showMessage(`路径不存在: ${cfg.repoPath}`, 4000, "error");
            return null;
        }

        const baseTitle = title || "Untitled";
        let slug = forceSlug || this.fname(baseTitle);
        let targetDir = path.join(cfg.repoPath, slug);
        const exportStartedAt = Date.now();

        this.setProgress(12, "导出 SiYuan HTML(SiYuan) 正文...");
        showMessage("导出 SiYuan HTML(SiYuan) 中...", 1800, "info");

        const r = await fetchSyncPost("/api/export/exportHTML", {
            id: docId,
            pdf: false,
            removeAssets: false,
            merge: true,
            savePath: "",
        });
        if (!r || r.code !== 0 || !r.data) {
            const msg = r?.msg || "未知";
            if (source === "share") {
                const error = new Error(`无法读取该文档，请打开原文档后重新发布。${msg ? ` (${msg})` : ""}`);
                error._pagesMessageShown = true;
                this.finishProgress(error.message, true);
                showMessage(error.message, 6000, "error");
                throw error;
            }
            this.finishProgress("导出失败: " + msg, true);
            showMessage("导出失败: " + msg, 5000, "error");
            return null;
        }

        const exportedName = (r.data.name || "").trim();
        const finalSlug = forceSlug || this.fname(exportedName || baseTitle);
        if (finalSlug !== slug) {
            slug = finalSlug;
            targetDir = path.join(cfg.repoPath, slug);
        }

        this.setProgress(32, `准备本地目录: ${slug}`);
        this.ensureEmptyDir(targetDir);
        let resourceResult = r;
        this.setProgress(42, "复制/导出原生资源文件...");
        if (!this.copyNativeExportFolder(r.data.folder, targetDir)) {
            resourceResult = await fetchSyncPost("/api/export/exportHTML", {
                id: docId,
                pdf: false,
                removeAssets: false,
                merge: true,
                savePath: targetDir,
            });
            if (!resourceResult || resourceResult.code !== 0 || !resourceResult.data) {
                this.finishProgress("资源导出失败: " + (resourceResult?.msg || "未知"), true);
                showMessage("资源导出失败: " + (resourceResult?.msg || "未知"), 5000, "error");
                return null;
            }
        }

        this.setProgress(58, "生成 index.html...");
            if (typeof r.data.content === "string" && r.data.content.trim()) {
                fs.writeFileSync(
                    path.join(targetDir, "index.html"),
                    await this.buildSiYuanNativeHTML(r.data.content, exportedName || baseTitle, `../${SHARED_ASSETS_DIR}`),
                    "utf-8",
                );
            }

        this.setProgress(68, "校验导出产物...");
        const resolved = this.resolveSiYuanExportOutput({
            repoPath: cfg.repoPath,
            targetDir,
            slug,
            title: baseTitle,
            exportedName: (resourceResult.data?.name || exportedName || "").trim(),
            exportStartedAt,
        });

        if (!resolved.ok) {
            this.finishProgress("导出失败：未找到 index.html", true);
            showMessage("导出失败: 未找到index.html(SiYuan原生导出产物)v3.6.5", 6000, "error");
            return null;
        }

        this.setProgress(74, "归并公共资源...");
        this.consolidateSharedAssets(cfg.repoPath, targetDir);

        showMessage(`已导出: ${slug}/index.html`, 2500, "info");

        if (cfg.autoCommit) {
            this.setProgress(78, "Git 提交并推送...");
            await this.gitPush(cfg.repoPath, exportedName || baseTitle, slug);
        }

        const url = this.buildShareUrl(cfg.pagesUrl, slug);
        const now = new Date().toISOString();
        const record = this.upsertShareRecord({
            id: `${cfg.platform}-${docId}-${slug}`,
            docId,
            title: exportedName || baseTitle,
            platform: cfg.platform,
            slug,
            url,
            repoPath: cfg.repoPath,
            createdAt: now,
            updatedAt: now,
            autoCommit: cfg.autoCommit,
        });

        if (source === "current") {
            this.applyCurrentDocInfo({
                docId,
                title: exportedName || baseTitle || docId,
                source: "publish-success",
            });
        }

        if (cfg.autoCommit) {
            this.finishProgress(`发布成功: ${url}`);
            showMessage(`发布成功! ${url}`, 6000, "info");
        } else {
            this.finishProgress(`导出完成: ${slug}/index.html`);
            showMessage(`导出完成: ${slug}/index.html`, 4000, "info");
        }

        return {
            record,
            cfg,
            slug,
            targetDir,
            url,
        };
    }

    async updateShare(record) {
        try {
            const result = await this.publishByDocId(record.docId, {
                title: record.title,
                forceSlug: record.slug,
                platform: record.platform,
            });
            if (result?.record) {
                showMessage(`分享已更新: ${result.record.url}`, 4000, "info");
            }
        } catch (err) {
            console.error("[siyuan-plugin-gitee-pages] updateShare failed:", err);
            if (!err?._pagesMessageShown) {
                showMessage(`更新分享失败: ${this.formatError(err)}`, 5000, "error");
            }
        }
    }

    async deleteShare(record) {
        try {
            await this.runExclusiveTask(async () => {
                const repoPath = record.repoPath || this.currentConfig(record.platform).repoPath;
                if (!repoPath) {
                    showMessage("删除失败：缺少仓库路径", 4000, "error");
                    return;
                }
                const scopeDir = record.slug;
                this.setProgress(10, `删除本地目录: ${scopeDir}`);
                await this.deletePublishedDir({ ...record, repoPath });
                try {
                    this.setProgress(65, "同步删除到远程...");
                    await this.gitCommitAndPush(repoPath, `Delete published page: ${record.title || record.slug}`, scopeDir);
                } catch (err) {
                    const msg = this.formatError(err);
                    console.error("[siyuan-plugin-gitee-pages] deleteShare git sync failed:", err);
                    this.finishProgress("本地目录已删除但远端同步失败", true);
                    showMessage(`本地目录已删除但远端同步失败: ${msg}`, 7000, "error");
                    return;
                }
                this.removeShareRecord(record.id);
                this.finishProgress(`删除成功: ${scopeDir}`);
                showMessage("分享已删除并同步到远程仓库", 4000, "info");
            });
        } catch (err) {
            console.error("[siyuan-plugin-gitee-pages] deleteShare failed:", err);
            if (!err?._pagesMessageShown) {
                showMessage(`删除失败: ${this.formatError(err)}`, 5000, "error");
            }
        }
    }

    async deletePublishedDir(record) {
        const dir = path.join(record.repoPath, record.slug);
        if (!fs.existsSync(dir)) {
            showMessage("本地目录不存在，将继续尝试同步 Git 删除", 3500, "warn");
            return;
        }
        fs.rmSync(dir, { recursive: true, force: true });
    }

    async gitCommitAndPush(repoPath, message, scopeDir) {
        return this.gitPush(repoPath, message || "Delete published page", scopeDir, message);
    }

    buildShareUrl(baseUrl, slug) {
        return baseUrl ? `${baseUrl}/${encodeURIComponent(slug)}/` : `${slug}/`;
    }

    formatDateTime(value) {
        const d = value ? new Date(value) : null;
        if (!d || Number.isNaN(d.getTime())) return "-";
        return d.toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    async openLocalPath(dir) {
        if (!dir) {
            showMessage("缺少本地目录路径", 3000, "warn");
            return;
        }
        if (!fs.existsSync(dir)) {
            showMessage(`目录不存在: ${dir}`, 4000, "error");
            return;
        }
        const quoted = `"${dir.replace(/"/g, '\\"')}"`;
        let cmd = "";
        if (process.platform === "win32") cmd = `cmd /c start "" ${quoted}`;
        else if (process.platform === "darwin") cmd = `open ${quoted}`;
        else cmd = `xdg-open ${quoted}`;
        try {
            await this.runCommand(cmd, { cwd: path.dirname(dir) });
        } catch (err) {
            console.error("[siyuan-plugin-gitee-pages] openLocalPath failed:", err);
            showMessage(`打开目录失败: ${this.formatError(err)}`, 5000, "error");
        }
    }

    resolveSiYuanExportOutput({ repoPath, targetDir, slug, title, exportedName, exportStartedAt }) {
        // A. 直接在目标目录找到 index.html
        this.normalizeExportLayout(targetDir, exportedName);
        if (this.hasIndex(targetDir)) return { ok: true };

        // B. 导出到了 repo 的其他目录（常见于不同版本导出行为差异）
        const dirCandidates = [];
        const pushDir = (d) => {
            if (!d) return;
            const normalized = path.resolve(d);
            if (!dirCandidates.includes(normalized)) dirCandidates.push(normalized);
        };
        pushDir(path.join(repoPath, slug));
        if (exportedName) {
            pushDir(path.join(repoPath, exportedName));
            pushDir(path.join(repoPath, this.fname(exportedName)));
        }
        if (title) pushDir(path.join(repoPath, title));
        pushDir(path.join(repoPath, this.fname(title || "")));

        for (const dir of dirCandidates) {
            if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
            this.normalizeExportLayout(dir, exportedName);
            if (this.hasIndex(dir)) {
                this.copyDirToTarget(dir, targetDir);
                return { ok: this.hasIndex(targetDir) };
            }
        }

        // C. 导出成“根目录 html + 资源目录”的扁平结构
        const rootHtml = this.pickRootHtmlCandidate(repoPath, slug, title, exportedName, exportStartedAt);
        if (rootHtml) {
            this.buildTargetFromFlatRoot(repoPath, targetDir, rootHtml);
            return { ok: this.hasIndex(targetDir) };
        }

        return { ok: false };
    }

    hasIndex(dir) {
        return fs.existsSync(path.join(dir, "index.html"));
    }

    copyNativeExportFolder(folder, targetDir) {
        if (!folder || typeof folder !== "string") return false;
        const workspaceDir = globalThis.window?.siyuan?.config?.system?.workspaceDir || "";
        const candidates = [
            folder,
            path.resolve(folder),
            workspaceDir ? path.join(workspaceDir, folder) : "",
            workspaceDir ? path.join(workspaceDir, "temp", folder) : "",
        ];
        for (const candidate of candidates) {
            if (!candidate) continue;
            try {
                if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) continue;
                this.copyRecursive(candidate, targetDir);
                return true;
            } catch (e) { /* try next */ }
        }
        return false;
    }

    pickRootHtmlCandidate(repoPath, slug, title, exportedName, exportStartedAt) {
        const candidates = [];
        const push = (f) => { if (f && !candidates.includes(f)) candidates.push(f); };
        push(path.join(repoPath, `${slug}.html`));
        if (title) push(path.join(repoPath, `${title}.html`));
        if (exportedName) {
            push(path.join(repoPath, `${exportedName}.html`));
            push(path.join(repoPath, `${this.fname(exportedName)}.html`));
        }

        try {
            const top = fs.readdirSync(repoPath, { withFileTypes: true });
            for (const e of top) {
                if (!e.isFile()) continue;
                if (!e.name.toLowerCase().endsWith(".html")) continue;
                if (e.name.toLowerCase() === "index.html") continue;
                push(path.join(repoPath, e.name));
            }
        } catch (e) { /* ignore */ }

        for (const f of candidates) {
            if (!fs.existsSync(f)) continue;
            if (this.isRecentFile(f, exportStartedAt, 30_000)) return f;
        }
        return null;
    }

    isRecentFile(filePath, sinceMs, toleranceMs) {
        try {
            const st = fs.statSync(filePath);
            return st.isFile() && st.mtimeMs >= (sinceMs - toleranceMs);
        } catch (e) {
            return false;
        }
    }

    copyDirToTarget(srcDir, targetDir) {
        this.ensureEmptyDir(targetDir);
        this.copyRecursive(srcDir, targetDir);
    }

    buildTargetFromFlatRoot(repoPath, targetDir, htmlPath) {
        this.ensureEmptyDir(targetDir);
        fs.copyFileSync(htmlPath, path.join(targetDir, "index.html"));

        for (const name of ["appearance", "stage", "assets"]) {
            const src = path.join(repoPath, name);
            if (!fs.existsSync(src)) continue;
            if (!fs.statSync(src).isDirectory()) continue;
            this.copyRecursive(src, path.join(targetDir, name));
        }
    }

    getSharedAssetsRoot(repoPath) {
        return path.join(repoPath, SHARED_ASSETS_DIR);
    }

    consolidateSharedAssets(repoPath, targetDir) {
        const sharedRoot = this.getSharedAssetsRoot(repoPath);
        fs.mkdirSync(sharedRoot, { recursive: true });
        for (const name of ["appearance", "stage"]) {
            const src = path.join(targetDir, name);
            if (!fs.existsSync(src)) continue;
            this.copyRecursiveSmart(src, path.join(sharedRoot, name));
            this.removeIfExists(src);
        }
    }

    ensureEmptyDir(dir) {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        fs.mkdirSync(dir, { recursive: true });
    }

    normalizeExportLayout(targetDir, exportedName) {
        if (fs.existsSync(path.join(targetDir, "index.html"))) return;

        const candidates = [];
        if (exportedName) {
            candidates.push(path.join(targetDir, exportedName));
        }
        try {
            const childDirs = fs.readdirSync(targetDir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => path.join(targetDir, e.name));
            for (const d of childDirs) candidates.push(d);
        } catch (e) { /* ignore */ }

        for (const d of candidates) {
            if (fs.existsSync(path.join(d, "index.html"))) {
                this.moveChildrenToDir(d, targetDir);
                return;
            }
        }
    }

    moveChildrenToDir(srcDir, dstDir) {
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
            const from = path.join(srcDir, entry.name);
            const to = path.join(dstDir, entry.name);
            if (fs.existsSync(to)) {
                fs.rmSync(to, { recursive: true, force: true });
            }
            fs.renameSync(from, to);
        }
        fs.rmSync(srcDir, { recursive: true, force: true });
    }

    copyRecursive(src, dst) {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            fs.mkdirSync(dst, { recursive: true });
            for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
                const from = path.join(src, entry.name);
                const to = path.join(dst, entry.name);
                if (entry.isDirectory()) {
                    this.copyRecursive(from, to);
                } else if (entry.isSymbolicLink()) {
                    const link = fs.readlinkSync(from);
                    fs.symlinkSync(link, to);
                } else {
                    fs.copyFileSync(from, to);
                }
            }
            return;
        }
        fs.copyFileSync(src, dst);
    }

    copyRecursiveSmart(src, dst) {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            fs.mkdirSync(dst, { recursive: true });
            for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
                this.copyRecursiveSmart(path.join(src, entry.name), path.join(dst, entry.name));
            }
            return;
        }
        if (fs.existsSync(dst)) {
            try {
                const dstStat = fs.statSync(dst);
                if (dstStat.isFile() && dstStat.size === stat.size) return;
                fs.rmSync(dst, { recursive: true, force: true });
            } catch (e) {
                fs.rmSync(dst, { recursive: true, force: true });
            }
        }
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
    }

    removeIfExists(targetPath) {
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }
    }

    // === SiYuan 原生 HTML(SiYuan) 外壳 ===
    async buildSiYuanNativeHTML(content, title, sharedBase = ".") {
        const siyuan = globalThis.window?.siyuan || {};
        const appearance = siyuan.config?.appearance || {};
        const editor = siyuan.config?.editor || {};
        const version = siyuan.config?.system?.kernelVersion || siyuan.config?.system?.version || "3.6.5";
        const lang = appearance.lang || "zh_CN";
        const lightTheme = appearance.themeLight || "daylight";
        const darkTheme = appearance.themeDark || "midnight";
        const mode = Number(appearance.mode || 0);
        const themeName = appearance.mode === 1
            ? darkTheme
            : lightTheme;
        const themeMode = mode === 1 ? "dark" : "light";
        const skipThemeStyle = (mode === 1 && darkTheme === "midnight") || (mode === 0 && lightTheme === "daylight");
        const themeStyle = skipThemeStyle
            ? ""
            : `<link rel="stylesheet" type="text/css" id="themeStyle" href="${this.esc(sharedBase)}/appearance/themes/${this.esc(themeName)}/theme.css?${this.esc(version)}"/>`;
        const safeTitle = this.esc(title || "Untitled");
        const js = (v) => JSON.stringify(v ?? "");
        const iconName = appearance.icon || "material";
        const iconScripts = (["ant", "material"].includes(iconName) ? "" : `<script src="${this.esc(sharedBase)}/appearance/icons/material/icon.js?v=${this.esc(version)}"></script>`)
            + `<script src="${this.esc(sharedBase)}/appearance/icons/${this.esc(iconName)}/icon.js?v=${this.esc(version)}"></script>`;
        const petalCSS = await this.getPetalCSS();
        const protyleBase = `${this.esc(sharedBase)}/stage/protyle`;

        return `<!DOCTYPE html>
<html lang="${this.esc(lang)}" data-theme-mode="${themeMode}" data-light-theme="${this.esc(lightTheme)}" data-dark-theme="${this.esc(darkTheme)}">
<head>
    <base href="">
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"/>
    <meta name="mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <link rel="stylesheet" type="text/css" id="baseStyle" href="${this.esc(sharedBase)}/stage/build/export/base.css?v=${this.esc(version)}"/>
    <link rel="stylesheet" type="text/css" id="themeDefaultStyle" href="${this.esc(sharedBase)}/appearance/themes/${this.esc(themeName)}/theme.css?v=${this.esc(version)}"/>
    <script src="${this.esc(sharedBase)}/stage/protyle/js/protyle-html.js?v=${this.esc(version)}"></script>
    ${themeStyle}
    <title>${safeTitle}</title>
    <!-- Exported by SiYuan v${this.esc(version)} -->
    <style>
        body {margin:0;font-family: var(--b3-font-family);background-color: var(--b3-theme-background);color: var(--b3-theme-on-background)}
        :root { --b3-font-size-editor: ${Number(editor.fontSize || 16)}px }
        .b3-typography code:not(.hljs), .protyle-wysiwyg span[data-type~=code] { font-variant-ligatures: ${editor.codeLigatures ? "normal" : "none"} }
        .pages-pub-layout {max-width:1280px;margin:0 auto;padding:32px 24px 64px}
        .pages-pub-main {min-width:0;margin-left:320px}
        #preview {max-width: 800px;margin: 0 auto}
        #preview :is(h1,h2,h3,h4,[data-type="NodeHeading"],[data-type~="NodeHeading"],[data-subtype="h1"],[data-subtype="h2"],[data-subtype="h3"],[data-subtype="h4"],.h1,.h2,.h3,.h4) {scroll-margin-top:84px}
        #pages-pub-toc {position:fixed;top:24px;left:max(24px, calc(50vw - 616px));width:260px;max-height:calc(100vh - 48px);overflow:auto;border:1px solid var(--b3-border-color);border-radius:16px;background:color-mix(in srgb, var(--b3-theme-background) 92%, var(--b3-theme-surface) 8%);box-shadow:0 8px 30px rgba(0,0,0,.08)}
        .pages-pub-toc__head {display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 10px;border-bottom:1px solid var(--b3-border-color)}
        .pages-pub-toc__title {font-size:14px;font-weight:600;color:var(--b3-theme-on-background)}
        .pages-pub-toc__toggle {display:none;padding:6px 10px;border:1px solid var(--b3-border-color);border-radius:999px;background:var(--b3-theme-background);color:var(--b3-theme-on-background);font-size:12px}
        .pages-pub-toc__body {padding:10px 8px 14px}
        .pages-pub-toc__list {display:flex;flex-direction:column;gap:2px}
        .pages-pub-toc-link {display:block;padding:7px 10px;border-radius:10px;color:var(--b3-theme-on-background);text-decoration:none;font-size:13px;line-height:1.5;transition:background-color .2s,color .2s}
        .pages-pub-toc-link:hover {background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}
        .pages-pub-toc-link.active {background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);font-weight:600}
        .pages-pub-toc-link.toc-level-2 {padding-left:22px}
        .pages-pub-toc-link.toc-level-3 {padding-left:34px}
        .pages-pub-toc-link.toc-level-4 {padding-left:46px}
        .pages-pub-toc-empty {padding:8px 10px;color:var(--b3-theme-on-surface-light);font-size:13px}
        body.pages-pub-no-toc .pages-pub-main {margin-left:0}
        #pages-pub-toc.pages-pub-toc--empty:not(.is-open) .pages-pub-toc__body {display:block}
        @media (max-width: 1100px) {
            .pages-pub-layout {padding:20px 16px 48px}
            .pages-pub-main {margin-left:0}
            #pages-pub-toc {position:sticky;top:0;left:auto;width:auto;max-height:none;margin-bottom:16px;z-index:20}
            .pages-pub-toc__head {padding:12px 14px}
            .pages-pub-toc__toggle {display:inline-flex;align-items:center;justify-content:center}
            #pages-pub-toc .pages-pub-toc__body {display:none}
            #pages-pub-toc.is-open .pages-pub-toc__body {display:block}
        }
        ${petalCSS}
    </style>
    ${this.getEnabledSnippetCSS()}
</head>
<body>
<div class="pages-pub-layout">
    <aside id="pages-pub-toc" aria-label="目录">
        <div class="pages-pub-toc__head">
            <div class="pages-pub-toc__title">目录</div>
            <button type="button" class="pages-pub-toc__toggle" id="pages-pub-toc-toggle" aria-expanded="false">展开</button>
        </div>
        <div class="pages-pub-toc__body">
            <div class="pages-pub-toc__list" id="pages-pub-toc-list">
                <div class="pages-pub-toc-empty">正在生成目录...</div>
            </div>
        </div>
    </aside>
    <main class="pages-pub-main">
        <div class="protyle-wysiwyg${editor.displayBookmarkIcon === false ? "" : " protyle-wysiwyg--attr"}" id="preview">${content}</div>
    </main>
</div>
${iconScripts}
<script src="${this.esc(sharedBase)}/stage/build/export/protyle-method.js?v=${this.esc(version)}"></script>
<script src="${this.esc(sharedBase)}/stage/protyle/js/lute/lute.min.js?v=${this.esc(version)}"></script>  
<script>
window.siyuan = {
  config: {
    appearance: {
      mode: ${mode},
      codeBlockThemeDark: ${js(appearance.codeBlockThemeDark || "github-dark")},
      codeBlockThemeLight: ${js(appearance.codeBlockThemeLight || "github")}
    },
    editor: {
      codeLineWrap: ${editor.codeLineWrap !== false},
      codeLigatures: ${editor.codeLigatures === true},
      codeSyntaxHighlightLineNum: ${editor.codeSyntaxHighlightLineNum !== false},
      fontSize: ${Number(editor.fontSize || 16)},
      plantUMLServePath: ${js(editor.plantUMLServePath || "")},
      katexMacros: ${js(editor.katexMacros || "")}
    }
  },
  languages: { copy: ${js(siyuan.languages?.copy || "复制")} }
};
const previewElement = document.getElementById("preview");
Protyle.highlightRender(previewElement, ${js(protyleBase)});
Protyle.mathRender(previewElement, ${js(protyleBase)}, false);
Protyle.mermaidRender(previewElement, ${js(protyleBase)});
Protyle.flowchartRender(previewElement, ${js(protyleBase)});
Protyle.graphvizRender(previewElement, ${js(protyleBase)});
Protyle.chartRender(previewElement, ${js(protyleBase)});
Protyle.mindmapRender(previewElement, ${js(protyleBase)});
Protyle.abcRender(previewElement, ${js(protyleBase)});
Protyle.htmlRender(previewElement);
Protyle.plantumlRender(previewElement, ${js(protyleBase)});
document.querySelectorAll(".protyle-action__copy").forEach((item) => {
  item.addEventListener("click", (event) => {
    navigator.clipboard.writeText(item.parentElement.nextElementSibling.textContent.trimEnd().replace(/\xA0/g, " ").replace(/\u200D\x60\x60\x60/g, "\x60\x60\x60"));
    event.preventDefault();
    event.stopPropagation();
  });
});
function initPagesPubToc() {
  const preview = document.getElementById("preview");
  const toc = document.getElementById("pages-pub-toc");
  const list = document.getElementById("pages-pub-toc-list");
  const toggle = document.getElementById("pages-pub-toc-toggle");
  if (!preview || !toc || !list) return;

  function getHeadingNodes(root) {
    const selector = [
      "h1", "h2", "h3", "h4",
      "[data-type='NodeHeading']",
      "[data-type~='NodeHeading']",
      "[data-subtype='h1']",
      "[data-subtype='h2']",
      "[data-subtype='h3']",
      "[data-subtype='h4']",
      ".h1", ".h2", ".h3", ".h4"
    ].join(",");
    const seen = new Set();
    return Array.from(root.querySelectorAll(selector))
      .filter((node) => {
        if (seen.has(node)) return false;
        seen.add(node);
        if (toc.contains(node)) return false;
        const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
        return !!text;
      })
      .map((node) => {
        const tag = node.tagName ? node.tagName.toLowerCase() : "";
        let level = 2;
        const tagMatch = tag.match(/^h([1-4])$/);
        if (tagMatch) {
          level = Number(tagMatch[1]);
        } else {
          const subtype = node.getAttribute("data-subtype") || "";
          const subtypeMatch = subtype.match(/^h([1-4])$/i);
          if (subtypeMatch) {
            level = Number(subtypeMatch[1]);
          } else if (node.classList) {
            for (let i = 1; i <= 4; i += 1) {
              if (node.classList.contains("h" + i)) {
                level = i;
                break;
              }
            }
          }
        }
        return {
          node,
          level,
          text: String(node.textContent || "").replace(/\s+/g, " ").trim()
        };
      });
  }

  function slugify(text) {
    const input = String(text || "").trim().toLowerCase();
    const normalized = input.normalize ? input.normalize("NFKD") : input;
    const withoutMarks = normalized.replace(/[\\u0300-\\u036f]/g, "");
    const cleaned = withoutMarks
      .replace(/[^\\w\\u4e00-\\u9fff\\-\\s]/g, " ")
      .replace(/[_\\s]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return cleaned || "section";
  }

  const headings = getHeadingNodes(preview);
  console.debug("[Pages Publisher] TOC headings:", headings.length);
  if (!headings.length) {
    toc.classList.add("pages-pub-toc--empty");
    document.body.classList.add("pages-pub-no-toc");
    list.innerHTML = '<div class="pages-pub-toc-empty">暂无目录</div>';
    return;
  }

  toc.classList.remove("pages-pub-toc--empty");
  document.body.classList.remove("pages-pub-no-toc");

  const documentIds = Array.from(document.querySelectorAll("[id]")).map((el) => el.id).filter(Boolean);
  const idCounts = documentIds.reduce((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
  const usedIds = new Set();
  let activeId = "";

  function ensureId(node, text) {
    const current = (node.getAttribute("id") || "").trim();
    if (current && (idCounts[current] || 0) === 1 && !usedIds.has(current)) {
      usedIds.add(current);
      return current;
    }
    const base = slugify(text || "heading");
    let id = base;
    let index = 1;
    while (usedIds.has(id)) {
      id = base + "-" + index;
      index += 1;
    }
    node.id = id;
    usedIds.add(id);
    return id;
  }

  list.innerHTML = "";
  const links = [];
  headings.forEach((item) => {
    const id = ensureId(item.node, item.text);
    const link = document.createElement("a");
    link.className = "pages-pub-toc-link toc-level-" + Math.min(Math.max(item.level, 1), 4);
    link.href = "#" + encodeURIComponent(id);
    link.textContent = item.text;
    link.dataset.targetId = id;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.getElementById(id);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      if (history && typeof history.replaceState === "function") {
        history.replaceState(null, "", "#" + encodeURIComponent(id));
      }
      if (window.innerWidth <= 1100) {
        toc.classList.remove("is-open");
        if (toggle) {
          toggle.textContent = "展开";
          toggle.setAttribute("aria-expanded", "false");
        }
      }
    });
    list.appendChild(link);
    links.push(link);
  });

  function setActive(id) {
    if (!id || id === activeId) return;
    activeId = id;
    links.forEach((item) => {
      item.classList.toggle("active", item.dataset.targetId === id);
    });
  }

  function syncActiveHeading() {
    let current = headings[0] || null;
    for (const item of headings) {
      const top = item.node.getBoundingClientRect().top;
      if (top <= 80) {
        current = item;
      } else {
        break;
      }
    }
    if (current && current.node.id) setActive(current.node.id);
  }

  if (toggle) {
    toggle.addEventListener("click", () => {
      const isOpen = toc.classList.toggle("is-open");
      toggle.textContent = isOpen ? "收起" : "展开";
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible && visible.target && visible.target.id) {
        setActive(visible.target.id);
      }
    }, { rootMargin: "-10% 0px -75% 0px", threshold: [0, 1] });
    headings.forEach((item) => observer.observe(item.node));
  } else {
    window.addEventListener("scroll", syncActiveHeading, { passive: true });
  }
  if (headings[0] && headings[0].node.id) setActive(headings[0].node.id);
  syncActiveHeading();
}
requestAnimationFrame(() => {
  setTimeout(initPagesPubToc, 0);
});
</script>
${this.getEnabledSnippetJS()}</body></html>`;
    }

    getEnabledSnippetCSS() {
        const styles = [];
        try {
            const doc = globalThis.window?.document;
            doc?.querySelectorAll?.("style").forEach((style) => {
                if ((style.id || "").startsWith("snippetCSS")) styles.push(style.outerHTML);
            });
        } catch (e) { /* ignore */ }

        try {
            const workspaceDir = globalThis.window?.siyuan?.config?.system?.workspaceDir;
            const confPath = workspaceDir ? path.join(workspaceDir, "data", "snippets", "conf.json") : "";
            if (confPath && fs.existsSync(confPath)) {
                const conf = JSON.parse(fs.readFileSync(confPath, "utf-8"));
                const snippets = Array.isArray(conf) ? conf : (conf.snippets || []);
                for (const item of snippets) {
                    if (item.enabled && item.type === "css" && item.content) {
                        styles.push(`<style data-name="${this.esc(item.name || "")}">\n${item.content}\n</style>`);
                    }
                }
            }
        } catch (e) { /* ignore */ }

        return styles.join("\n");
    }

    getEnabledSnippetJS() {
        const scripts = [];
        const appendFromConf = () => {
            const workspaceDir = globalThis.window?.siyuan?.config?.system?.workspaceDir;
            const confPath = workspaceDir ? path.join(workspaceDir, "data", "snippets", "conf.json") : "";
            if (!confPath || !fs.existsSync(confPath)) return false;
            const conf = JSON.parse(fs.readFileSync(confPath, "utf-8"));
            const snippets = Array.isArray(conf) ? conf : (conf.snippets || []);
            for (const item of snippets) {
                if (item.enabled && item.type === "js" && item.content) {
                    scripts.push(`<script type="text/javascript" id="snippetJS${this.esc(item.id || item.name || "")}">\n${item.content}\n</script>`);
                }
            }
            return scripts.length > 0;
        };

        try {
            if (appendFromConf()) return scripts.join("");
        } catch (e) { /* ignore */ }

        try {
            const doc = globalThis.window?.document;
            doc?.querySelectorAll?.("script").forEach((script) => {
                if ((script.id || "").startsWith("snippetJS")) scripts.push(script.outerHTML);
            });
        } catch (e) { /* ignore */ }
        return scripts.join("");
    }

    async getPetalCSS() {
        try {
            const r = await fetchSyncPost("/api/petal/loadPetals", { frontend: "desktop" });
            if (!r || r.code !== 0 || !Array.isArray(r.data)) return "";
            return r.data.map((item) => item.css || "").join("");
        } catch (e) {
            return "";
        }
    }

    // === Editorial 风格 HTML（纯系统字体，大陆秒开）===
    buildHTML(title, md, bc, cfg) {
        const body = this.md2html(md);
        const st = this.esc(cfg.siteTitle || "Notes");
        const plat = cfg.platform === "github" ? "GitHub" : "Gitee";
        const ds = new Date().toLocaleDateString("zh-CN", { year:"numeric", month:"long", day:"numeric" });

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${this.esc(title)} — ${st}</title>
<style>
:root {
  --bg:#faf8f5; --text:#2c2416; --muted:#8c7b6c; --faint:#b8a99a;
  --accent:#c75b39; --aglow:rgba(199,91,57,.1);
  --border:#e8e0d5; --blight:#f0ebe3;
  --code-bg:#f5f1eb; --code-tx:#5c4a3a;
  --bq-border:#c75b39; --bq-bg:rgba(199,91,57,.04);
  --tbl-stripe:#faf7f2;
  --sh:0 1px 3px rgba(44,36,22,.04);
  --mw:720px;
}
@media(prefers-color-scheme:dark){
  :root {
    --bg:#1a1816; --text:#e8e4df; --muted:#9c9082; --faint:#665c52;
    --accent:#e07b55; --aglow:rgba(224,123,85,.1);
    --border:#3a3530; --blight:#2c2824;
    --code-bg:#252220; --code-tx:#c4b8a8;
    --bq-border:#e07b55; --bq-bg:rgba(224,123,85,.06);
    --tbl-stripe:#201e1b;
    --sh:0 1px 3px rgba(0,0,0,.2);
  }
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{
  font-family:Georgia,"Noto Serif SC","Source Han Serif SC","STSong","SimSun",serif;
  font-size:1.125rem;line-height:1.85;color:var(--text);background:var(--bg);
  -webkit-font-smoothing:antialiased;
}
body::before{content:"";position:fixed;top:0;left:0;right:0;height:3px;background:var(--accent);z-index:100}
.container{max-width:var(--mw);margin:0 auto;padding:5rem 1.5rem 4rem}

/* header */
.header{margin-bottom:3.5rem;padding-bottom:2.5rem;border-bottom:1px solid var(--blight);animation:fadeUp .7s ease both}
.breadcrumb{font-size:.8rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-bottom:1.25rem}
.breadcrumb span{color:var(--faint);margin:0 .35rem}
.title{font-family:Georgia,"Noto Serif SC","STSong",serif;font-size:2.6rem;font-weight:700;line-height:1.2;letter-spacing:-.015em;color:var(--text)}
.meta{display:flex;align-items:center;gap:1rem;margin-top:1.25rem;font-size:.9rem;color:var(--muted)}
.meta .dot{width:4px;height:4px;border-radius:50%;background:var(--accent);opacity:.5}

/* content */
.content{animation:fadeUp .7s .15s ease both}
.content h2,.content h3{font-family:Georgia,"Noto Serif SC","STSong",serif;font-weight:600;color:var(--text);margin:2.2em 0 .6em}
.content h2{font-size:1.75rem;padding-bottom:.45em;border-bottom:1px solid var(--blight)}
.content h3{font-size:1.4rem}
.content p{margin:1em 0;text-align:justify}
.content a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--aglow);transition:.2s}
.content a:hover{border-color:var(--accent);background:var(--aglow)}
.content img{max-width:100%;border-radius:6px;box-shadow:var(--sh);margin:1.5em 0}
.content pre{background:var(--code-bg);color:var(--code-tx);padding:1.25rem 1.5rem;border-radius:8px;overflow-x:auto;margin:1.5em 0;font-size:.9rem;line-height:1.65;border:1px solid var(--blight)}
.content code{font-family:"JetBrains Mono","Fira Code","Cascadia Code","Courier New",monospace;font-size:.88em;background:var(--code-bg);padding:.15em .4em;border-radius:4px}
.content pre code{background:none;padding:0;font-size:inherit}
.content blockquote{border-left:3px solid var(--bq-border);background:var(--bq-bg);padding:1em 1.25em;margin:1.5em 0;border-radius:0 6px 6px 0;font-style:italic;color:var(--muted)}
.content ul,.content ol{padding-left:1.5em;margin:1em 0}
.content li{margin:.35em 0}
.content li::marker{color:var(--accent)}
.content table{border-collapse:separate;border-spacing:0;width:100%;margin:1.5em 0;border-radius:8px;overflow:hidden;border:1px solid var(--border);font-size:.95rem}
.content th{background:var(--code-bg);font-weight:600;font-size:.85rem;text-transform:uppercase;letter-spacing:.05em}
.content td,.content th{padding:.75em 1em;text-align:left;border-bottom:1px solid var(--blight)}
.content tr:last-child td{border-bottom:none}
.content tr:nth-child(even) td{background:var(--tbl-stripe)}
.content hr{border:none;height:1px;background:var(--blight);margin:2.5em 0;position:relative}
.content hr::after{content:"≡";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--bg);padding:0 .75em;color:var(--faint);font-size:1rem}

/* footer */
.footer{margin-top:4rem;padding-top:1.75rem;border-top:1px solid var(--blight);text-align:center;font-size:.8rem;color:var(--faint);letter-spacing:.04em;animation:fadeUp .7s .3s ease both}
.footer a{color:var(--muted);text-decoration:none}
.footer a:hover{color:var(--accent)}

@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:600px){.container{padding:3rem 1rem 2.5rem}.title{font-size:1.8rem}.content{font-size:1rem}}
</style>
</head>
<body>
<div class="container">
<header class="header">
  <div class="breadcrumb">${bc ? this.esc(bc).replace(/\//g,"<span>/</span>") : ""}${bc?"<span>/</span>":""}文章</div>
  <h1 class="title">${this.esc(title)}</h1>
  <div class="meta"><span>${ds}</span><span class="dot"></span><span>${st}</span></div>
</header>
<article class="content">${body}</article>
<footer class="footer">${st} · <a href="https://${plat.toLowerCase()}.com" target="_blank">${plat} Pages</a></footer>
</div>
</body>
</html>`;
    }

    // === Markdown → HTML ===
    md2html(md) {
        if (!md) return "";
        let h = md;
        h = h.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        // code blocks
        h = h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,lang,code)=>`<pre><code class="language-${lang}">${code.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")}</code></pre>`);
        // inline code
        h = h.replace(/`([^`]+)`/g,(_,c)=>`<code>${c.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")}</code>`);
        // headings
        h = h.replace(/^#### (.+)$/gm,"<h4>$1</h4>").replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
        // bold/italic/strikethrough
        h = h.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/__(.+?)__/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/_(.+?)_/g,"<em>$1</em>").replace(/~~(.+?)~~/g,"<del>$1</del>");
        // img / link
        h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1" loading="lazy">');
        h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
        // hr
        h = h.replace(/^---$/gm,"<hr>").replace(/^\*\*\*$/gm,"<hr>");
        // blockquote
        h = h.replace(/^&gt; (.+)$/gm,"<blockquote><p>$1</p></blockquote>");
        h = h.replace(/(<blockquote>[\s\S]*?<\/blockquote>\n?)+/g,m=>`<blockquote>${m.replace(/<\/?blockquote>/g,"")}</blockquote>`);
        // lists
        h = h.replace(/^[\-\*] (.+)$/gm,"<li>$1</li>");
        h = h.replace(/^\d+\. (.+)$/gm,"<li>$1</li>");
        h = h.replace(/(<li>.*<\/li>\n?)+/g,m=>`<ul>${m}</ul>`);
        // tables
        let lines=h.split("\n"),inT=false,rows=[],out=[];
        for(let l of lines){l=l.trim();
            if(/^\|.*\|$/.test(l)){let c=l.replace(/^\||\|$/g,"").split("|").map(c=>c.trim());
                if(/^[\-:]+$/.test(c[0]))continue;
                rows.push("<tr>"+c.map((c,i)=>`<${inT?"td":"th"}>${c}</${inT?"td":"th"}>`).join("")+"</tr>");inT=true;
            }else{if(inT){out.push("<table>"+rows.join("")+"</table>");rows=[];inT=false;}out.push(l);}
        }
        if(inT)out.push("<table>"+rows.join("")+"</table>");h=out.join("\n");
        // paragraphs
        lines=h.split("\n");out=[];
        for(let l of lines){let t=l.trim();
            if(t===""||/^<(h[1-6]|pre|ul|ol|li|table|tr|t[hd]|blockquote|hr|img|p)\b/i.test(t)||t.startsWith("</"))out.push(l);
            else out.push(`<p>${t}</p>`);
        }
        return out.join("\n");
    }

    // === Git push ===
    async gitPush(repoPath, title, scopeDir, commitMessage) {
        let committed = false;
        try {
            const o={cwd:repoPath};
            await this.runCommand("git rev-parse --git-dir", o);
            this.setProgress(82, "Git 暂存变更...");
            if (scopeDir) await this.runCommand(`git add -A -- "${scopeDir}"`,o);
            else await this.runCommand("git add -A",o);
            let changed=false;
            try{
                await this.runCommand("git diff --cached --quiet", o);
                changed=false;
            }catch(e){
                changed=true;
            }
            if(!changed){
                if (await this.isBranchAhead(o)) {
                    this.setProgress(88, "补推之前未推送的提交...");
                    showMessage("无新变化，补推之前未推送的提交...", 2500, "info");
                    await this.runGitPushWithRetry(o);
                } else {
                    showMessage("无变化，跳过",2000,"info");
                }
                return;
            }
            this.setProgress(86, "Git 创建提交...");
            const finalMessage = commitMessage || `Publish SiYuan HTML: ${title}`;
            await this.runCommand(`git commit -m "${String(finalMessage || "").replace(/"/g,'\\"')}"`,o);
            committed = true;
            this.setProgress(92, "推送到远程仓库...");
            showMessage("推送中...",2000,"info");
            await this.runGitPushWithRetry(o);
        }catch(err){
            const m = this.formatError(err);
            const hint = /Could not connect|Failed to connect|Connection was reset|unable to access/i.test(m)
                ? "网络无法连接 GitHub；本地提交已保留，网络恢复后再次点击发布会自动补推。"
                : "本地提交已保留，请修复 Git 问题后再次发布。";
            showMessage(`${committed ? "Git 推送失败" : "Git 失败"}: ${hint}\n${m}`, 8000, "error");
            err._pagesMessageShown = true;
            throw err;
        }
    }

    async runGitPushWithRetry(options) {
        const attempts = [
            "git push",
            "git -c http.version=HTTP/1.1 push",
            "git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 push",
        ];
        let lastErr = null;
        for (const cmd of attempts) {
            try {
                await this.runCommand(cmd, options);
                return;
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr;
    }

    async isBranchAhead(options) {
        try {
            await this.runCommand("git rev-parse --abbrev-ref --symbolic-full-name @{u}", options);
            const { stdout } = await this.runCommand("git rev-list --count @{u}..HEAD", options);
            const out = String(stdout || "").trim();
            return Number(out) > 0;
        } catch (err) {
            return false;
        }
    }

    runCommand(cmd, options) {
        return execAsync(cmd, {
            cwd: options.cwd,
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024,
        });
    }

    formatError(err) {
        if (!err) return "未知错误";
        const raw = err.stderr || err.stdout || err.message || String(err);
        const text = Buffer.isBuffer(raw) ? raw.toString("utf-8") : String(raw);
        return text.replace(/\r/g, "").trim().split("\n").slice(0, 8).join("\n");
    }

    fname(s){return(s||"untitled").replace(/[<>:"/\\|?*]/g,"-").replace(/\s+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").substring(0,100)||"untitled";}
    esc(s){return s?String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"):"";}
    escAttr(s){return this.esc(s).replace(/'/g,"&#39;");}
}

module.exports = PagesPublisher;
