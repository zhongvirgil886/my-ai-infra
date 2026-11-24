import path from 'node:path';
import { hash, safe } from './fs.mjs';
import { snapshot, equalEntry } from './entries.mjs';
import { legacyRuleActions } from './legacy-instructions.mjs';

// Runtime principles belong to the project. Only their locations and links are managed.
export const RULES = [
  { entry: 'AGENTS.md', source: '.agents/rules/AGENTS.md', tools: ['codex', 'cursor', 'mcode'] },
  { entry: 'CLAUDE.md', source: '.agents/rules/CLAUDE.md', tools: ['claudecode'] },
  { entry: '.github/copilot-instructions.md', source: '.agents/rules/copilot-instructions.md', tools: ['copilot'] },
];
export const ruleTarget = (rule, source = rule.source) => path.posix.relative(path.posix.dirname(rule.entry), source);
export const SHARED_RULE_SOURCE = '.agents/rules/AGENTS.md';
const initialization = {
  codex: '在项目目录启动 codex，在会话中执行 /init；若提示文件已存在，请让它根据真实代码补全 AGENTS.md。',
  claudecode: '在项目目录启动 claude，在会话中执行 /init；若提示文件已存在，请让它根据真实代码补全 CLAUDE.md。',
  cursor: '在 Cursor Agent 中发送：请读取仓库，补全根目录 AGENTS.md 中的项目运行原则、命令和约束。',
  mcode: '在项目目录启动 MiniMax Code，在会话中执行 /init 补全根目录 AGENTS.md；若提示文件已存在，请让它根据真实代码补全。',
  copilot: '在项目目录执行 copilot init，或在 Copilot CLI 会话中执行 /init，补全 .github/copilot-instructions.md。',
};
// Installer namespaces, tool directories and internal files never act as project-maintained rule sources.
const RESERVED_RULE_SOURCES = ['.agents', '.my-ai-infra', '.my-ai-infra.json', '.gitignore', '.git', '.codex', '.claude', '.cursor', '.copilot', '.minimax', '.github/skills', '.github/agents', '.github/prompts', '.github/instructions'];
// A rule entry may link to a regular, non-empty text file maintained by the project (e.g. AGENTS.md -> docs/agent-rules.md).
// The target must stay inside the root without traversing any symlink; otherwise the link remains unknown.
export async function projectRuleSource(root, entry, before) {
  if (before?.kind !== 'symlink' || typeof before.target !== 'string' || path.isAbsolute(before.target) || path.posix.isAbsolute(before.target) || before.target.includes('\\')) return null;
  const source = path.posix.normalize(path.posix.join(path.posix.dirname(entry), before.target));
  if (source === '.' || source === '..' || source.startsWith('../') || source.startsWith('.my-ai-infra-recovery-')) return null;
  if (RULES.some(rule => rule.entry === source) || RESERVED_RULE_SOURCES.some(reserved => source === reserved || source.startsWith(reserved + '/'))) return null;
  try {
    await safe(root, source);
    const text = await snapshot(root, source);
    return text?.kind === 'file' && text.text.trim() ? { path: source, before: text } : null;
  } catch { return null; }
}
export const ruleInitialization = (tool, shared) => initialization[tool] + (shared ? ' AGENTS.md 与 CLAUDE.md 共用 AGENTS.md 唯一内容源，补全一次即可。' : '') + ' 请通过现有软链接写入，保留链接；完成后通过本工具再次同步并检查入口，沿用本次个人库和项目配置。';

export async function ruleActions(root, tools, oldFiles, inspect = relative => snapshot(root, relative)) {
  const legacy = await legacyRuleActions(root, oldFiles, inspect);
  const actions = new Map(legacy.map(action => [action.path, action]));
  const nextFiles = {}, nextSteps = [];
  const oldSource = actions.get('.agents/AGENTS.md');
  const claude = RULES.find(rule => rule.entry === 'CLAUDE.md');
  const claudeEntry = await inspect(claude.entry), claudeSource = await inspect(claude.source);
  const sharedTarget = ruleTarget(claude, SHARED_RULE_SOURCE);
  // `CLAUDE.md -> AGENTS.md` shares the root AGENTS rules; only a plain file or the managed link qualifies.
  const agentsEntry = await inspect('AGENTS.md');
  const rootAlias = claudeEntry?.kind === 'symlink' && claudeEntry.target === 'AGENTS.md'
    && (agentsEntry?.kind === 'file' || agentsEntry?.kind === 'symlink' && agentsEntry.target === SHARED_RULE_SOURCE);
  const sharedClaude = rootAlias
    || claudeEntry?.kind === 'symlink' && claudeEntry.target === '.agents/assets/rules/AGENTS.md'
    || claudeEntry?.kind === 'symlink' && claudeEntry.target === sharedTarget
    || oldFiles[claude.entry]?.kind === 'symlink' && oldFiles[claude.entry].target === sharedTarget
    || claudeEntry === null && claudeSource === null;
  const needsSharedAgents = sharedClaude && (claudeEntry !== null || tools.includes('claudecode'));
  let agentsProject = null;
  try { agentsProject = await projectRuleSource(root, 'AGENTS.md', await inspect('AGENTS.md')); } catch { /* The loop reports unreadable entries. */ }
  // Project-maintained sources are read for discovery only; they are never written or recorded as installed files.
  const keepProjectSource = source => {
    if (!actions.has(source.path)) actions.set(source.path, { path: source.path, action: 'preserve', before: source.before, after: source.before, projectRule: true, note: '项目自行维护的规则正文，安装器只读取、不改写' });
  };
  const sharedLinks = [sharedTarget, '.agents/assets/rules/AGENTS.md'];
  let migratedOldSource = false;
  for (const rule of RULES) {
    const source = rule.entry === 'CLAUDE.md' && sharedClaude ? SHARED_RULE_SOURCE : rule.source;
    const legacySource = source.replace('.agents/rules/','.agents/assets/rules/');
    const legacyBefore = await inspect(legacySource);
    let before, sourceBefore;
    try {
      before = await inspect(rule.entry);
      sourceBefore = await inspect(source);
    } catch (error) {
      actions.set(rule.entry, { path: rule.entry, action: 'conflict', before: null, after: null, reason: `规则路径无法安全读取：${error.message}` });
      continue;
    }
    const own = await projectRuleSource(root, rule.entry, before);
    if (own) {
      keepProjectSource(own);
      actions.set(rule.entry, { path: rule.entry, action: 'noop', before, after: before, projectRule: true, note: `保留项目规则链接，内容源为 ${own.path}` });
      continue;
    }
    if (rule.entry === 'CLAUDE.md' && sharedClaude && agentsProject && (before === null || before.kind === 'file' || before.kind === 'symlink' && sharedLinks.includes(before.target))) {
      // CLAUDE.md shares whatever AGENTS.md uses, including a project-maintained file.
      if (before === null && !tools.includes('claudecode')) continue;
      keepProjectSource(agentsProject);
      const after = { kind: 'symlink', target: ruleTarget(rule, agentsProject.path) };
      let body = '';
      if (before?.kind === 'symlink') {
        const linked = await inspect(before.target === sharedTarget ? SHARED_RULE_SOURCE : '.agents/assets/rules/AGENTS.md');
        if (linked && linked.kind !== 'file') { actions.set(rule.entry, { path: rule.entry, action: 'conflict', before, after, ruleSource: agentsProject.path, projectRule: true, reason: `CLAUDE.md 当前链接的中心规则不是普通文本文件，请先核对后改为链接 ${agentsProject.path}` }); continue; }
        body = linked?.text || '';
      } else if (before) {
        // Legacy cleanup may already have planned this entry; read its cleaned text.
        const legacyCleaned = actions.get(rule.entry);
        body = (legacyCleaned ? legacyCleaned.after : before)?.text || '';
      }
      if (body.trim() && body !== agentsProject.before.text) {
        actions.set(rule.entry, { path: rule.entry, action: 'conflict', before, after, ruleSource: agentsProject.path, projectRule: true, reason: `CLAUDE.md 当前内容与 AGENTS.md 链接的项目规则 ${agentsProject.path} 不同，请先合并到 ${agentsProject.path} 再重试；两份内容均已保留` });
        continue;
      }
      actions.set(rule.entry, { path: rule.entry, action: equalEntry(before, after) ? 'noop' : before === null ? 'create' : 'update', before, after, projectRule: true, note: `与 AGENTS.md 共用项目规则 ${agentsProject.path}` });
      continue;
    }
    const plannedSource = actions.get(source);
    if (plannedSource && !equalEntry(plannedSource.before, sourceBefore)) throw Error(`Rule changed during preview: ${source}; preview again`);
    const cleaned = actions.get(rule.entry);
    if (cleaned && !equalEntry(cleaned.before, before)) throw Error(`Rule changed during preview: ${rule.entry}; preview again`);
    let current = cleaned ? cleaned.after : before;
    const needed = rule.tools.some(tool => tools.includes(tool)) || rule.entry === 'AGENTS.md' && needsSharedAgents;
    const existingOwnSource = rule.entry === 'CLAUDE.md' && sharedClaude ? claudeSource : sourceBefore;
    if (!needed && before === null && existingOwnSource === null && legacyBefore === null) continue;
    const target = ruleTarget(rule, source);
    const conflict = reason => {
      if (!actions.has(source)) actions.set(source, { path: source, action: sourceBefore === null ? 'create' : 'preserve', before: sourceBefore, after: { kind: 'file', text: sourceBefore?.text || '' } });
      actions.set(rule.entry, { path: rule.entry, action: 'conflict', before, after: { kind: 'symlink', target }, ruleSource: source, reason });
      // merge/replace install this link; record it so the next plan sees a consistent state.
      nextFiles[rule.entry] = { kind: 'symlink', target, hash: hash(target) };
    };
    if (sourceBefore && sourceBefore.kind !== 'file') {
      actions.set(source, { path: source, action: 'conflict', before: sourceBefore, after: { kind: 'file', text: before?.kind === 'file' ? before.text : actions.get(source)?.after?.text || '' }, reason: '中心运行规则必须是普通文本文件' });
      actions.set(rule.entry, { path: rule.entry, action: equalEntry(before,{kind:'symlink',target}) ? 'noop' : before === null ? 'create' : 'update', before, after: { kind: 'symlink', target } });
      nextFiles[rule.entry] = { kind: 'symlink', target, hash: hash(target) }; continue;
    }
    if (before && !['file','symlink'].includes(before.kind)) { conflict('规则入口必须是文本文件或有效的相对软链接'); continue; }
    if (before?.kind === 'symlink') {
      if (before.target === target) current = sourceBefore;
      else if (rule.entry === 'CLAUDE.md' && rootAlias) current = null;
      else if (before.target === ruleTarget(rule,legacySource) && legacyBefore?.kind === 'file') current = legacyBefore;
      else if (before.target === path.posix.relative(path.posix.dirname(rule.entry), '.agents/AGENTS.md')) {
        if (oldSource?.before?.kind === 'symlink') { conflict('旧版中心规则是未知链接，请先核对；不会跟随该链接'); continue; }
        current = oldSource?.after || null;
        migratedOldSource = true;
      } else { conflict(`已有规则链接指向 ${before.target}，请先将需要的内容归入 ${source}；不会读取或覆盖未知目标`); continue; }
    }
    const incoming = current?.kind === 'file' ? current.text : legacyBefore?.kind === 'file' ? legacyBefore.text : '';
    if (legacyBefore && !actions.has(legacySource)) {
      const conflict = legacyBefore.kind !== 'file' || sourceBefore?.text?.trim() && legacyBefore.text.trim() && sourceBefore.text !== legacyBefore.text;
      actions.set(legacySource,{path:legacySource,before:legacyBefore,after:null,action:conflict?'conflict':'remove',...(conflict?{reason:'旧规则源与新源不同，保留并核对后迁移'}:{})});
    }
    const existing = (actions.get(source)?.after || sourceBefore)?.text;
    if (existing?.trim() && incoming.trim() && existing !== incoming) {
      actions.set(source, { path: source, action: 'preserve', before: sourceBefore, after: { kind: 'file', text: existing } });
      conflict(`入口与中心规则 ${source} 都有不同的非空内容，请先合并到中心文件，再移除入口副本并重试；两份内容均已保留`); continue;
    }
    const text = existing?.trim() ? existing : incoming || existing || '';
    const sourceAfter = { kind: 'file', text };
    actions.set(source, { path: source, action: sourceBefore === null ? 'create' : equalEntry(sourceBefore, sourceAfter) ? 'preserve' : 'update', before: sourceBefore, after: sourceAfter, note: '项目自行维护运行原则；安装器不注入 SDD 内容' });
    const after = { kind: 'symlink', target };
    actions.set(rule.entry, { path: rule.entry, action: equalEntry(before, after) ? 'noop' : before === null ? 'create' : 'update', before, after, note: cleaned?.note || `集中管理项目规则，入口软链接到 ${source}` });
    nextFiles[rule.entry] = { kind: 'symlink', target, hash: hash(target) };
    if (!text.trim()) for (const tool of rule.tools.filter(tool => tools.includes(tool))) {
      nextSteps.push({ tool, file: rule.entry, source, message: ruleInitialization(tool, needsSharedAgents && source === SHARED_RULE_SOURCE) });
    }
  }
  if (migratedOldSource && oldSource?.before?.kind === 'file') {
    // Known aliases have been moved. Conflicts abort the entire transaction before any writes.
    actions.set(oldSource.path, { ...oldSource, action: 'remove', after: null, note: '旧版共享源已分别迁移到 .agents/rules/，保留备份并移除旧源' });
  }
  const order = action => RULES.some(rule => rule.source === action.path) ? 0 : action.path === '.agents/AGENTS.md' ? 2 : 1;
  return { actions: [...actions.values()].sort((a, b) => order(a) - order(b)), nextFiles, nextSteps: nextSteps.filter(step => !actions.get(step.source)?.after?.text?.trim()) };
}
