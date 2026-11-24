# Checkpoint

## 最后更新

2026-11-23

## 当前版本

package.json 0.0.15；main = a3811b3（已推送 origin/main）。

## 最近完成

- 无引号 description 支持缩进续行（以空格折叠，空行保留为换行），第三方 Skill 无需改写即可导入。（5c7b8b0）
- `mai asset import PATH --replace`：先校验新目录，把旧个人 Skill 整目录移到 `<home>/backups/import-*/NAME/`，失败时恢复；内置名与非 Skill 类型拒绝；项目需再 `mai sync`。（5c7b8b0）
- `mai setup` 输出 `defaults.mode`（allSkills / fixed）。（a3811b3）
- 已有固定清单时 setup 只更新工具，已加回归测试；未复现“固定清单被改成 allSkills”，判断为当时尚无 defaults.json。
- 验证：`npm run verify` 289/289 通过（2026-11-23）；未运行 `test:web`、`release:check`。

## 进行中

- 分支 `chore/project-session-skills`（f311745，另一会话）基于 main，未合并、未推送。
- `fix/project-rules-link-source` 的规则链接修复已在 main。

## 下一步

- 如需发布新版本：按 docs/releasing.md 运行 `npm run release:check`，再决定版本号。
