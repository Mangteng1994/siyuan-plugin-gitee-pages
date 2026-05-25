# Pages Publisher — 思源笔记 Pages 发布插件

一键将思源笔记发布为**精美排版的静态 HTML 页面**，支持 **Gitee Pages** 和 **GitHub Pages**。

## 界面预览

发布后的页面采用 Editorial/Magazine 风格设计：
- Playfair Display + Source Serif 4 精致排版
- 温暖米白 / 暗棕深色双主题
- 淡入动效、自适应移动端
- 优雅的引用块、代码块、表格样式

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
2. 点击图标 → 选择 Gitee 或 GitHub → 填写仓库路径和 URL
3. 打开一篇笔记，点击图标 → 一键发布
4. 等待 1-3 分钟后访问 Pages 地址查看

## 特性

- 双平台支持：Gitee Pages + GitHub Pages，一键切换
- 精美排版：Editorial 杂志风格，自动跟随系统深色模式
- Markdown 全支持：标题、列表、代码块、表格、引用、图片
- 自动 Git：add → commit → push 全自动

## 注意事项

- 需安装 Git 命令行工具
- Gitee Pages 免费版推送后需手动点「更新」
- GitHub Pages 推送后自动部署（约 1 分钟）
- 图片使用思源原始 URL，建议配合图床插件

## 许可证

MIT
