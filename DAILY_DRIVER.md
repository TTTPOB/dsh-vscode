# DSH Sidebar 日用版本

本 fork 的日用安装包发布在 [GitHub Releases](https://github.com/TTTPOB/dsh-vscode/releases)，不发布到 Marketplace。自动化参考 `TTTPOB/openchamber` 的 `release-vscode-fork.yml`：跟踪上游正式 Release，保留个人修复，由 CI 测试并生成不可变 VSIX。

## 分支

- `main`：自动化入口与维护说明。GitHub 定时任务需要工作流存在于默认分支。
- `fix/webview-select-theme`：原生下拉框主题修复的独立来源，初始提交 `1324f04`。
- `daily-driver`：实际打包的源码。初始修复通过 `git cherry-pick -x 1324f04` 集成（`d5ba8e0`）；此后上游正式版本通过普通 merge 集成，保留修复与完整日用历史，不强推重建分支。
- `chore/daily-driver-release`：首次自动化配置的开发分支。

主题修复覆盖模型、推理强度、agent preset 三类原生选择框，依据 VS Code 注入的主题类选择 `color-scheme`，并让选项使用 `--vscode-dropdown-*`，缺失时回退到编辑器主题颜色。支持深色、浅色以及两种高对比度主题，不硬编码 Dracula 配色。

## 自动更新与手动构建

工作流：[Release daily driver VSIX](https://github.com/TTTPOB/dsh-vscode/actions/workflows/daily-driver-release.yml)。

每天 **02:23 UTC（北京时间 10:23）** 检查 `Lixxx1/dsh-vscode` 最新正式 Release。GitHub 定时执行可能延迟。没有新的源码且对应 Release 已存在时跳过依赖安装和构建。

在 Actions 页面选择 **Run workflow**，分支选 `main`，可以随时检查并构建。勾选 `force_build` 会重新测试并上传 CI artifact；已发布的同一源码 Release 不会被覆盖。

```sh
gh workflow run daily-driver-release.yml --repo TTTPOB/dsh-vscode --ref main
# 强制重建现有源码，产物在该次运行的 Artifacts 中。
gh workflow run daily-driver-release.yml --repo TTTPOB/dsh-vscode --ref main -f force_build=true
```

CI 先在临时 checkout 中将最新上游正式版本合入 `daily-driver`，再运行：

1. 按上游 `packageManager` 安装 pnpm，使用 frozen lockfile 安装依赖。
2. TypeScript 检查及完整单元测试。
3. Chromium 验证三类下拉框，涵盖四种 VS Code 主题、两种系统配色、存在或缺失 dropdown token 共 16 种组合，并检查键盘选择；产出 Dracula 配色下的列表截图。
4. `pnpm run package`，通过上游 `vscode:prepublish` 完成构建并生成 VSIX。

全部成功后才推进远端 `daily-driver` 并发布 VSIX。上游合并冲突、测试失败或分支在构建时被别人更新导致无法快进，都会停止发布，保留已有日用版本。工作流使用默认 `GITHUB_TOKEN`，不需要额外 PAT。

Release tag 格式为 `daily-v<上游版本>-<源码 SHA 前 12 位>`，指向真正构建的源码提交。附件包括 VSIX、`SHA256SUMS` 和 `provenance.json`（记录上游、日用源码及自动化提交）。重复运行不会覆盖 tag 或附件。若上传失败留下不完整的 draft，检查该次日志及 draft 后再处理并重试。

## 后续集成修复

所有修复先在独立功能分支开发并提交，然后按需集成：

```sh
git switch daily-driver
git pull --ff-only origin daily-driver
git cherry-pick -x <功能分支的修复提交>
git push origin daily-driver
gh workflow run daily-driver-release.yml --repo TTTPOB/dsh-vscode --ref main
```

无需在本地安装依赖或 build，验证交给 CI。新增修复如需专门的浏览器检查，应同步维护 `main` 的检查脚本。

## 安装

从日用 Release 下载 `.vsix`，在 VS Code 扩展面板的 `…` 菜单中选择 **Install from VSIX…**。包保留上游扩展标识 `lixxx1.dsh-sidebar` 与上游版本号，以便替换现有安装；同版本个人修复以 Release tag 区分。若希望始终保留个人修复，可关闭此扩展的 Marketplace 自动更新，改从日用 Release 安装。
