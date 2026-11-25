# Checkpoint

## 最后更新

2026-11-24

## 当前版本

package.json 0.0.15（npm 上的 0.0.15 由老师发布，不含本 fork 之后的修复）；main = 1fc55ca，已推送，与 origin/main 一致。origin 是老师仓库的公开 fork，只在自己的分支开发，不向 upstream 推送或提 PR。全局 `mai` 经 `npm link` 指向本仓库。

## 最近完成

- 无引号 description 支持缩进续行（以空格折叠，空行保留为换行），第三方 Skill 无需改写即可导入。（5c7b8b0）
- `mai asset import PATH --replace`：先校验新目录，把旧个人 Skill 整目录移到 `<home>/backups/import-*/NAME/`，失败时恢复；内置名与非 Skill 类型拒绝；项目需再 `mai sync`。（5c7b8b0）
- `mai setup` 输出 `defaults.mode`（allSkills / fixed）。（a3811b3）
- 已有固定清单时 setup 只更新工具，已加回归测试；未复现“固定清单被改成 allSkills”，判断为当时尚无 defaults.json。
- Claude Code 会话 Skill（project-load/save）已装入本仓库并合入 main。（e62e872）
- `npm run release:check` 在 e62e872 通过——verify 289/289、14 项隔离安装验收全 OK；未运行 `test:web`。
- 合入自己提给 upstream 的 PR：#17 受管 .gitignore 不再忽略 `/.agents/rules/`（d362a18）；#16 Windows 链接目标归一化、`CLAUDE.md → AGENTS.md` 别名按共享处理（1fc55ca）。`npm run verify` 293/293；Windows 未实测。
- upstream（shanggqm/my-ai-infra）main 无新提交，已全部包含（2026-11-23 核对）。
- 全局 `mai` 原链接指向已移走的旧路径，已在本仓库 `npm link` 修复。
- compass（`../02_compass`）：已同步修正 Hook 路径；turbo 改写 AGENTS.md 的问题已由用户在 compass 提交修复（b395afc）。
- 个人库（2026-11-24）：个人 Skill 源为私有仓库 learn-claude 的 `assets/skills/`；`learn-from-zero` 已按其最新版 `--replace`；`web-access` 已移出到 `~/.my-ai-infra/backups/remove-1795576661000-web-access/`。现有 12 个个人 Skill，均未装到任何项目或全局工具。

## 进行中

- upstream 上的 #16/#17 仍 open，由用户决定，不在此处理。
- 本地分支 `fix/merge-rules-pr16-pr17` 与 main 相同；`chore/project-session-skills`、`fix/project-rules-link-source` 已含于 main，均可删除。
- compass 在新版 mai 下 doctor 待处理 `.gitignore`（移除受管区块中的 `/.agents/rules/`），由用户在 compass 中运行 `mai sync`；compass 暂存区有 `.idea` 文件待用户确认。
- `review-project-requirements` 未能导入个人库：含 12 张 PNG，mai 只支持文本 Skill。

## 已知问题与候选改进

- mai 不支持二进制资产导入，也没有 `asset remove`（本次手工移目录）；两者可作为 fork 内的新需求。
- turbo 2.11.x 检测到 AI 工具时会把链接形式的 `AGENTS.md` 替换为普通文件并追加托管块；可用 `turbo.json` 的 `"agentGuidance": false` 规避。可考虑写入 docs/troubleshooting.md。
- 个人库 `projects.json` 只追加不清理，仍有已移走的旧路径（`02_jk/compass`、`02_jk/my-ai-infra`），暂无清理命令。
- `CLAUDE.md → AGENTS.md` 且 `AGENTS.md → docs/...`（项目自维护正文）的组合仍按未知链接报冲突。
- 本仓库 `.gitignore` 受管区块仍有 `/.agents/rules/`（第 176 行）与手工反向规则（248–250 行），下次对本仓库 sync 时会移除受管行。

## 下一步

- 换电脑：clone 自己的 fork 并 `npm link`；clone learn-claude，用 `mai asset import` 导入个人 Skill；`mai setup`，再在各项目 `mai plan` / `mai sync`。
- 需要时把 `learn-from-zero`、`build-fde-project` 加入项目或全局默认清单后同步。
- 可选：为数据实验类需求编写个人 Skill（如 `my-data-experiment`）。
- 发布：npm 包 `@easyuseai/my-ai-infra` 由老师维护，本 fork 不发布 npm；其他电脑经 clone + `npm link` 使用。合入代码后仍按需运行 `npm run test:web`、`npm run release:check` 验收。
