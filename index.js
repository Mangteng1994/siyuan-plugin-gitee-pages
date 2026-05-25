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
const execAsync = promisify(exec);

class PagesPublisher extends Plugin {
    constructor(options) {
        super(options);
        this.currentProtyle = null;
        this.currentDocId = "";
        this.currentDocTitle = "";
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
        };
    }

    normalizeConfig(cfg) {
        const d = cfg || {};
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
            this.updateDocInfo();
        });
        this.eventBus.on("loaded-protyle-dynamic", ({ detail }) => {
            this.currentProtyle = detail?.protyle;
            this.updateDocInfo();
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

    updateDocInfo() {
        if (!this.currentProtyle) return;
        try {
            const b = this.currentProtyle.block;
            if (b) {
                this.currentDocId = b.rootID || b.rootId || b.id || "";
                this.currentDocTitle = b.title || "";
            }
        } catch (e) { /* ignore */ }
    }

    // 获取当前平台配置
    currentConfig() {
        const d = this.data[STORAGE_KEY];
        const p = d.platform || "gitee";
        const pc = d[p] || {};
        return {
            platform: p,
            repoPath: pc.repoPath || "",
            pagesUrl: (pc.pagesUrl || "").replace(/\/+$/, ""),
            siteTitle: pc.siteTitle || "Notes",
            autoCommit: d.autoCommit !== false,
        };
    }

    // 显示设置+发布面板
    showPanel() {
        const data = this.data[STORAGE_KEY];
        const that = this;
        const refs = {};
        const plat = data.platform || "gitee";
        const currentPlatform = () => data.platform || "gitee";

        this.setting = new Setting({ width: "680px", height: "620px" });

        // ── 注入样式 ──
        this.setting.addItem({
            title: "", description: "",
            createActionElement: () => {
                const s = document.createElement("style");
                s.textContent = `
                    .pp-setting-dialog {
                        height: auto !important;
                        max-height: min(84vh, 720px) !important;
                    }
                    .pp-setting-dialog .b3-dialog__body {
                        flex: 0 1 auto !important;
                    }
                    .pp-setting-dialog .b3-dialog__content {
                        flex: 0 1 auto !important;
                        overflow: auto !important;
                        padding-bottom: 10px !important;
                    }

                    .config__tab-container .b3-label.pp-field {
                        min-height: 0 !important;
                        height: auto !important;
                        padding: 10px 0 !important;
                        align-items: center !important;
                    }
                    .config__tab-container .b3-label.pp-field .b3-label__text {
                        flex: 0 0 360px !important;
                        min-width: 240px !important;
                        margin: 0 !important;
                    }
                    .config__tab-container .b3-label.pp-field .b3-label__text > span { display:block; }
                    .config__tab-container .b3-label.pp-field .b3-label__text > span:last-child { margin-top: 4px; }
                    .config__tab-container .b3-label.pp-field .b3-label__action {
                        flex: 1 1 auto !important;
                        width: auto !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        margin-left: 16px !important;
                    }
                    .config__tab-container .b3-label.pp-field .b3-switch {
                        margin-left: 0 !important;
                    }

                    .pp-platform-cards { display:flex; gap:10px; }
                    .pp-platform-card {
                        flex:1 1 180px; min-width:180px; padding:10px 12px; border:1.5px solid var(--b3-border-color);
                        border-radius:10px; cursor:pointer; transition:all .2s;
                        display:flex; align-items:center; gap:10px;
                        font-size:14px; font-weight:500; background:var(--b3-theme-surface);
                    }
                    .pp-platform-card:hover { border-color:var(--b3-theme-primary-light); background:var(--b3-theme-primary-lightest); }
                    .pp-platform-card.active { border-color:var(--b3-theme-primary); background:var(--b3-theme-primary-lightest); box-shadow:0 0 0 1px var(--b3-theme-primary); }
                    .pp-platform-card .pp-dot { width:10px;height:10px;border-radius:50%;background:var(--b3-border-color);flex-shrink:0;transition:background .2s; }
                    .pp-platform-card.active .pp-dot { background:var(--b3-theme-primary);box-shadow:0 0 0 3px var(--b3-theme-primary-lightest); }
                    .pp-platform-card .pp-name { font-size:14px;font-weight:600; }

                    .pp-input {
                        width:100%; padding:8px 12px; font-size:14px;
                        border:1.5px solid var(--b3-border-color); border-radius:8px;
                        background:var(--b3-theme-surface); color:var(--b3-theme-on-surface);
                        outline:none; transition:border-color .2s,box-shadow .2s; font-family:inherit;
                    }
                    .pp-input:hover { border-color:var(--b3-theme-primary-light); }
                    .pp-input:focus { border-color:var(--b3-theme-primary); box-shadow:0 0 0 3px var(--b3-theme-primary-lightest); }
                    .pp-input::placeholder { color:var(--b3-theme-on-surface-light);opacity:.4; }

                    .pp-publish-btn {
                        width:100%; padding:10px 20px; font-size:14px; font-weight:600;
                        border:none; border-radius:10px; cursor:pointer; color:#fff;
                        background:linear-gradient(135deg,var(--b3-theme-primary),color-mix(in srgb,var(--b3-theme-primary) 70%,#000));
                        box-shadow:0 2px 10px rgba(0,0,0,.08); transition:all .25s;
                    }
                    .pp-publish-btn:hover { transform:translateY(-1px); box-shadow:0 4px 18px rgba(0,0,0,.12); }
                    .pp-publish-btn:active { transform:translateY(0); }
                    .pp-publish-btn:disabled { opacity:.5;cursor:not-allowed;transform:none; }

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
                        .pp-platform-cards { flex-wrap: wrap; }
                        .pp-platform-card { min-width: 0; flex: 1 1 calc(50% - 5px); }
                    }
                `;
                requestAnimationFrame(() => {
                    const dialog = s.closest(".b3-dialog__container");
                    if (dialog) dialog.classList.add("pp-setting-dialog");
                });
                return s;
            },
        });

        // ── 平台选择 ──
        this.setting.addItem({
            title: "托管平台",
            description: "选择发布到 Gitee Pages 或 GitHub Pages",
            direction: "row",
            className: "pp-field",
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
            description: "Pages 仓库在本地的克隆路径",
            direction: "row",
            className: "pp-field",
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
            description: "发布后的访问地址",
            direction: "row",
            className: "pp-field",
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
            description: "HTML 页面顶部显示的站点名称",
            direction: "row",
            className: "pp-field",
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
            description: "导出 HTML 后自动 commit 并 push 到远程仓库",
            className: "pp-field",
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
            className: "pp-field",
            createActionElement: () => {
                const btn = document.createElement("button");
                btn.className = "pp-publish-btn";
                btn.textContent = "发布当前文档";
                btn.addEventListener("click", () => {
                    if (that.publishTask) {
                        showMessage("已有发布任务正在后台运行", 2500, "info");
                        return;
                    }
                    btn.textContent = "后台发布中…";
                    btn.disabled = true;
                    that.runPublishInBackground();
                });
                return btn;
            },
        });

        this.setting.open(this.displayName || "Pages 发布");
    }

    runPublishInBackground() {
        this.closePublishPanel();
        this.publishTask = Promise.resolve()
            .then(() => this.publish())
            .finally(() => { this.publishTask = null; });
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
        const cfg = this.currentConfig();
        this.setProgress(3, "检查发布配置...");

        if (!cfg.repoPath) {
            this.finishProgress("发布失败：请先填写仓库路径", true);
            showMessage("请先填写仓库路径", 3000, "warn");
            return;
        }
        if (!fs.existsSync(cfg.repoPath)) {
            this.finishProgress(`发布失败：路径不存在 ${cfg.repoPath}`, true);
            showMessage(`路径不存在: ${cfg.repoPath}`, 4000, "error");
            return;
        }

        this.updateDocInfo();
        if (!this.currentDocId) {
            this.finishProgress("发布失败：请先打开一篇文档", true);
            showMessage("请先打开一篇文档", 3000, "warn");
            return;
        }

        try {
            const title = this.currentDocTitle || "Untitled";
            let slug = this.fname(title);
            let targetDir = path.join(cfg.repoPath, slug);
            const exportStartedAt = Date.now();

            this.setProgress(12, "导出 SiYuan HTML(SiYuan) 正文...");
            showMessage("导出 SiYuan HTML(SiYuan) 中...", 1800, "info");

            // 先按原生 HTML(SiYuan) 菜单同款参数导出正文，避免 savePath 影响 HTML 属性顺序。
            const r = await fetchSyncPost("/api/export/exportHTML", {
                id: this.currentDocId,
                pdf: false,
                removeAssets: false,
                merge: true,
                savePath: "",
            });
            if (!r || r.code !== 0 || !r.data) {
                this.finishProgress("导出失败: " + (r?.msg || "未知"), true);
                showMessage("导出失败: " + (r?.msg || "未知"), 5000, "error");
                return;
            }
            const exportedName = (r.data.name || "").trim();
            const finalSlug = this.fname(exportedName || title);
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
                    id: this.currentDocId,
                    pdf: false,
                    removeAssets: false,
                    merge: true,
                    savePath: targetDir,
                });
                if (!resourceResult || resourceResult.code !== 0 || !resourceResult.data) {
                    this.finishProgress("资源导出失败: " + (resourceResult?.msg || "未知"), true);
                    showMessage("资源导出失败: " + (resourceResult?.msg || "未知"), 5000, "error");
                    return;
                }
            }

            this.setProgress(58, "生成 index.html...");
            if (typeof r.data.content === "string" && r.data.content.trim()) {
                fs.writeFileSync(
                    path.join(targetDir, "index.html"),
                    await this.buildSiYuanNativeHTML(r.data.content, exportedName || title),
                    "utf-8",
                );
            }
            this.setProgress(68, "校验导出产物...");
            const resolved = this.resolveSiYuanExportOutput({
                repoPath: cfg.repoPath,
                targetDir,
                slug,
                title,
                exportedName: (resourceResult.data?.name || exportedName || "").trim(),
                exportStartedAt,
            });

            if (!resolved.ok) {
                this.finishProgress("导出失败：未找到 index.html", true);
                showMessage("导出失败: 未找到index.html(SiYuan原生导出产物)v3.6.5", 6000, "error");
                return;
            }

            showMessage(`已导出: ${slug}/index.html`, 2500, "info");

            // Git（只提交该文档目录，避免误改仓库其他内容）
            if (cfg.autoCommit) {
                this.setProgress(78, "Git 提交并推送...");
                await this.gitPush(cfg.repoPath, exportedName || title, slug);
                const url = cfg.pagesUrl ? `${cfg.pagesUrl}/${encodeURIComponent(slug)}/` : `${slug}/`;
                this.finishProgress(`发布成功: ${url}`);
                showMessage(`发布成功! ${url}`, 6000, "info");
            } else {
                this.finishProgress(`导出完成: ${slug}/index.html`);
            }
        } catch (err) {
            this.finishProgress(`发布失败: ${this.formatError(err)}`, true);
            if (!err?._pagesMessageShown) {
                showMessage(`失败: ${this.formatError(err)}`, 5000, "error");
            }
            console.error(err);
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

    // === SiYuan 原生 HTML(SiYuan) 外壳 ===
    async buildSiYuanNativeHTML(content, title) {
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
            : `<link rel="stylesheet" type="text/css" id="themeStyle" href="appearance/themes/${this.esc(themeName)}/theme.css?${this.esc(version)}"/>`;
        const safeTitle = this.esc(title || "Untitled");
        const js = (v) => JSON.stringify(v ?? "");
        const iconName = appearance.icon || "material";
        const iconScripts = (["ant", "material"].includes(iconName) ? "" : `<script src="appearance/icons/material/icon.js?v=${this.esc(version)}"></script>`)
            + `<script src="appearance/icons/${this.esc(iconName)}/icon.js?v=${this.esc(version)}"></script>`;
        const petalCSS = await this.getPetalCSS();

        return `<!DOCTYPE html>
<html lang="${this.esc(lang)}" data-theme-mode="${themeMode}" data-light-theme="${this.esc(lightTheme)}" data-dark-theme="${this.esc(darkTheme)}">
<head>
    <base href="">
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"/>
    <meta name="mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <link rel="stylesheet" type="text/css" id="baseStyle" href="stage/build/export/base.css?v=${this.esc(version)}"/>
    <link rel="stylesheet" type="text/css" id="themeDefaultStyle" href="appearance/themes/${this.esc(themeName)}/theme.css?v=${this.esc(version)}"/>
    <script src="stage/protyle/js/protyle-html.js?v=${this.esc(version)}"></script>
    ${themeStyle}
    <title>${safeTitle}</title>
    <!-- Exported by SiYuan v${this.esc(version)} -->
    <style>
        body {font-family: var(--b3-font-family);background-color: var(--b3-theme-background);color: var(--b3-theme-on-background)}
        :root { --b3-font-size-editor: ${Number(editor.fontSize || 16)}px }
        .b3-typography code:not(.hljs), .protyle-wysiwyg span[data-type~=code] { font-variant-ligatures: ${editor.codeLigatures ? "normal" : "none"} }
        ${petalCSS}
    </style>
    ${this.getEnabledSnippetCSS()}
</head>
<body>
<div class="protyle-wysiwyg${editor.displayBookmarkIcon === false ? "" : " protyle-wysiwyg--attr"}" 
style="max-width: 800px;margin: 0 auto;" id="preview">${content}</div>
${iconScripts}
<script src="stage/build/export/protyle-method.js?v=${this.esc(version)}"></script>
<script src="stage/protyle/js/lute/lute.min.js?v=${this.esc(version)}"></script>  
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
Protyle.highlightRender(previewElement, "stage/protyle");
Protyle.mathRender(previewElement, "stage/protyle", false);
Protyle.mermaidRender(previewElement, "stage/protyle");
Protyle.flowchartRender(previewElement, "stage/protyle");
Protyle.graphvizRender(previewElement, "stage/protyle");
Protyle.chartRender(previewElement, "stage/protyle");
Protyle.mindmapRender(previewElement, "stage/protyle");
Protyle.abcRender(previewElement, "stage/protyle");
Protyle.htmlRender(previewElement);
Protyle.plantumlRender(previewElement, "stage/protyle");
document.querySelectorAll(".protyle-action__copy").forEach((item) => {
  item.addEventListener("click", (event) => {
    navigator.clipboard.writeText(item.parentElement.nextElementSibling.textContent.trimEnd().replace(/\xA0/g, " ").replace(/\u200D\x60\x60\x60/g, "\x60\x60\x60"));
    event.preventDefault();
    event.stopPropagation();
  });
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
    async gitPush(repoPath, title, scopeDir) {
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
            await this.runCommand(`git commit -m "Publish SiYuan HTML: ${title.replace(/"/g,'\\"')}"`,o);
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
}

module.exports = PagesPublisher;
