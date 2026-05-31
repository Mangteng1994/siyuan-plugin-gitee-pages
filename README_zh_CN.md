# Pages Publisher — 思源笔记 Pages 发布插件

一键将思源笔记发布为静态 HTML 页面，支持 **Gitee Pages** 和 **GitHub Pages**。

## 渲染效果

发布后的 HTML 页面使用思源笔记内置的 **Protyle 渲染引擎**和**当前主题 CSS**，外观与编辑器预览保持一致。自动附带：
- 思源当前主题样式
- 侧边目录导航（TOC），支持点击跳转和滚动高亮
- 已启用的 CSS/JS 代码片段和花瓣（Petals）
- 响应式布局，适配移动端

## 前置准备

### GitHub Pages（推荐，无需实名）

1. 新建仓库，**仓库名必须是 `你的用户名.github.io`**（如 `zhangsan.github.io`）
2. 设置 → Pages → Source 选 `main` 分支 → Save
3. 本地 `git clone`

### Gitee Pages（需实名认证）

1. 新建仓库（建议与用户名同名，如 `zhangsan`）
2. 服务 → Gitee Pages → 启动
3. 本地 `git clone`

两种 Pages 都可在插件中切换，互不冲突。

## 使用方法

1. 重启思源，顶栏出现「发布到 Pages」图标
2. 点击图标 → 选择 Gitee 或 GitHub → 填写仓库本地路径和 Pages URL
3. 打开一篇笔记，点击图标 → 一键发布
4. GitHub Pages 等待 1-3 分钟后访问；Gitee Pages 需手动点击「更新」

## 特性

- 双平台支持：Gitee Pages + GitHub Pages，一键切换
- 思源原生渲染：使用 Protyle 引擎和当前主题，所见即所得
- 自动生成侧边目录导航，支持滚动跟随高亮、移动端折叠
- Markdown 全支持：标题、列表、代码块、表格、引用、图片、链接
- 自动附带启用的 CSS/JS 代码片段和花瓣
- 自动 Git：add → commit → push 全自动
- 发布记录管理，支持重新发布、删除、手动推送、推送状态追踪
- 多仓库路径 / 多 URL 历史管理，支持自定义标签和筛选
- 打开配置目录，手动编辑 `pages-pub-config`
- 分享列表与本地仓库文件自动同步

## 发布产物结构

```
仓库根目录/
├── pages-pub-assets/          # 共享资源（主题 CSS、Protyle JS）
├── 文档目录/                   # 每篇文档一个子目录
│   ├── index.html
│   └── assets/...             # 图片等关联资源
```

## 注意事项

- 需安装 Git 命令行工具
- 仓库路径最好选择已 `git clone` 的本地目录；插件现在会在导出前检查 Git 状态，并拦截不安全的自动推送场景
- Gitee Pages 免费版推送后需手动点「更新」；GitHub Pages 自动部署
- 图片建议通过思源资源方式导入，或配合图床插件使用
- 更换思源主题后需重新发布才能同步样式

## 常见问题

**推送冲突**：在仓库目录执行 `git pull --rebase` 后重试。

**没有 upstream / 手动 `git init + remote add`**：如果远端已有另一台电脑推送的文件，请先备份当前目录再重新 `git clone`；如果本地还没有提交且工作区干净，插件会只在安全场景下自动初始化跟踪分支。

**认证失败**：GitHub 需使用 SSH Key 或 Personal Access Token。

**图片不显示**：确保图片是思源资源文件而非本地绝对路径引用。

**样式差异**：发布效果取决于当前思源主题，更换主题后需重新发布。

## 更新日志

### v1.0.5

- 新增发布前 Git 仓库检查：在导出文件前先识别仓库是否适合自动推送，避免文章已导出后才因无 upstream 失败。
- 支持空远端仓库的首次 `git push -u origin <branch>`，以及“远端已有内容但本地尚无提交且工作区干净”时安全初始化跟踪分支。
- 优化无 upstream 错误提示：针对手动 `git init + remote add` 指向已有远端仓库的场景，明确提示先备份当前目录并重新 clone。
- 修复分享列表与主配置区域对齐问题。
- 标签编辑改为行内编辑器，并确保标签保存稳定持久化。
- 支持分号作为标签分隔符。
- 多仓库 / 多 URL 历史：每个平台都可保存仓库路径和 Pages URL 历史，方便切换与管理。
- 设置界面支持打开配置目录，便于手动编辑 `pages-pub-config`。
- pull / push 后自动同步分享列表，并支持从磁盘刷新文档树分享标记。
- `syncRemoteThenPush` 改进：pull 前检查工作区是否干净，rebase 冲突时自动中止并给出明确提示。
- 修复 TOC、删除后刷新与推送进度收尾问题，成功 / 跳过 / 同步路径都会正确完成进度。

## 许可证

MIT
