import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { apply, doctor, plan } from '../src/project.mjs';
import { hash, json, readJSON, write } from '../src/fs.mjs';

const both = { version: 1, tools: ['codex', 'claudecode'], skills: ['my-create-feature'] };
const codexOnly = { version: 1, tools: ['codex'], skills: ['my-create-feature'] };
const rules = '# Project rules\n\nUse pnpm and uv.\n';
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-rules-link-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'), home = path.join(root, 'personal');
  await write(project, 'docs/agent-rules.md', rules);
  await fs.symlink('docs/agent-rules.md', path.join(project, 'AGENTS.md'));
  return { root, project, home };
}
const link = (project, file) => fs.readlink(path.join(project, file));
const missing = (project, file) => assert.rejects(fs.lstat(path.join(project, file)), { code: 'ENOENT' });
async function assertHealthy(home, project) {
  const report = await doctor(home, project);
  assert.deepEqual(report.issues, []);
  assert.equal(report.healthy, true);
  return report;
}

test('a root rules link to a tracked project file stays the shared source for AGENTS.md and CLAUDE.md', async t => {
  const { home, project } = await fixture(t);
  const preview = await plan(home, project, both, { conflict: 'abort' });
  assert.deepEqual(preview.conflicts, []);
  assert.deepEqual(preview.nextSteps, []);
  assert.equal(preview.actions.find(a => a.path === 'AGENTS.md').action, 'noop');
  assert.equal(preview.actions.find(a => a.path === 'docs/agent-rules.md').action, 'preserve');
  assert.deepEqual(preview.actions.find(a => a.path === 'CLAUDE.md').after, { kind: 'symlink', target: 'docs/agent-rules.md' });

  const result = await apply(home, project, both, preview.revision, { conflict: 'abort' });
  assert.equal(result.complete, true);
  assert.equal(await link(project, 'AGENTS.md'), 'docs/agent-rules.md');
  assert.equal(await link(project, 'CLAUDE.md'), 'docs/agent-rules.md');
  assert.equal(await fs.readFile(path.join(project, 'CLAUDE.md'), 'utf8'), rules);
  assert.equal(await fs.readFile(path.join(project, 'docs/agent-rules.md'), 'utf8'), rules);
  await missing(project, '.agents/rules/AGENTS.md');
  const state = await readJSON(project, '.my-ai-infra/state.json');
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'docs/agent-rules.md']) assert.equal(state.files[file], undefined);
  const ignore = await fs.readFile(path.join(project, '.gitignore'), 'utf8');
  assert.doesNotMatch(ignore, /^\/(AGENTS|CLAUDE)\.md$|agent-rules/m);

  const report = await assertHealthy(home, project);
  assert.deepEqual(report.discovery.filter(entry => entry.type === 'rules').map(entry => [entry.path, entry.status]), [['AGENTS.md', 'ready'], ['CLAUDE.md', 'ready']]);
  const again = await apply(home, project, undefined, undefined, { conflict: 'abort' });
  assert.deepEqual(again.actions.filter(a => ['AGENTS.md', 'CLAUDE.md'].includes(a.path)).map(a => a.action), ['noop', 'noop']);
  await assertHealthy(home, project);
});

test('an existing CLAUDE.md link to the same project file is kept, and Codex alone never adds CLAUDE.md', async t => {
  const compass = await fixture(t);
  await fs.symlink('docs/agent-rules.md', path.join(compass.project, 'CLAUDE.md'));
  await apply(compass.home, compass.project, both, undefined, { conflict: 'abort' });
  assert.equal(await link(compass.project, 'CLAUDE.md'), 'docs/agent-rules.md');
  await assertHealthy(compass.home, compass.project);

  const codex = await fixture(t);
  await apply(codex.home, codex.project, codexOnly, undefined, { conflict: 'abort' });
  assert.equal(await link(codex.project, 'AGENTS.md'), 'docs/agent-rules.md');
  await missing(codex.project, 'CLAUDE.md');
  await assertHealthy(codex.home, codex.project);
  // Adding Claude Code later links CLAUDE.md to the same project file.
  await apply(codex.home, codex.project, both, undefined, { conflict: 'abort' });
  assert.equal(await link(codex.project, 'CLAUDE.md'), 'docs/agent-rules.md');
  await assertHealthy(codex.home, codex.project);
  // Removing Claude Code removes only the CLAUDE.md link; the project file stays.
  await apply(codex.home, codex.project, codexOnly, undefined, { conflict: 'abort' });
  await missing(codex.project, 'CLAUDE.md');
  assert.equal(await fs.readFile(path.join(codex.project, 'docs/agent-rules.md'), 'utf8'), rules);
  await assertHealthy(codex.home, codex.project);
});

test('a CLAUDE.md left on the empty central source by an older sync follows the restored project link', async t => {
  const { home, project } = await fixture(t);
  const shared = '.agents/rules/AGENTS.md';
  await write(project, shared, '');
  await fs.symlink(shared, path.join(project, 'CLAUDE.md'));
  await write(project, '.my-ai-infra.json', json(both));
  await write(project, '.my-ai-infra/state.json', json({ version: 4, files: Object.fromEntries(['AGENTS.md', 'CLAUDE.md'].map(file => [file, { kind: 'symlink', target: shared, hash: hash(shared) }])) }));
  await apply(home, project, undefined, undefined, { conflict: 'abort' });
  assert.equal(await link(project, 'AGENTS.md'), 'docs/agent-rules.md');
  assert.equal(await link(project, 'CLAUDE.md'), 'docs/agent-rules.md');
  await assertHealthy(home, project);
});

test('a shared CLAUDE.md with different central content is a conflict; merge keeps both texts', async t => {
  const { home, project } = await fixture(t);
  await write(project, '.agents/rules/AGENTS.md', '# Central notes\n');
  await fs.symlink('.agents/rules/AGENTS.md', path.join(project, 'CLAUDE.md'));
  const preview = await plan(home, project, both, { conflict: 'abort' });
  assert.deepEqual(preview.conflicts.map(item => item.path), ['CLAUDE.md']);
  await assert.rejects(apply(home, project, both, undefined, { conflict: 'abort' }), error => error.exitCode === 2);
  assert.equal(await link(project, 'CLAUDE.md'), '.agents/rules/AGENTS.md');
  await apply(home, project, both, undefined, { conflict: 'merge' });
  assert.equal(await link(project, 'CLAUDE.md'), 'docs/agent-rules.md');
  assert.equal(await fs.readFile(path.join(project, 'docs/agent-rules.md'), 'utf8'), rules);
  assert.equal(await fs.readFile(path.join(project, '.agents/rules/AGENTS.md'), 'utf8'), '# Central notes\n');
  await assertHealthy(home, project);
});

test('an independent CLAUDE.md file keeps its own central source next to the project AGENTS.md link', async t => {
  const { home, project } = await fixture(t);
  await write(project, 'CLAUDE.md', '# Claude only\n');
  await apply(home, project, both, undefined, { conflict: 'abort' });
  assert.equal(await link(project, 'AGENTS.md'), 'docs/agent-rules.md');
  assert.equal(await link(project, 'CLAUDE.md'), '.agents/rules/CLAUDE.md');
  assert.equal(await fs.readFile(path.join(project, 'CLAUDE.md'), 'utf8'), '# Claude only\n');
  assert.equal(await fs.readFile(path.join(project, 'docs/agent-rules.md'), 'utf8'), rules);
  await assertHealthy(home, project);
});

test('rules links outside the root, through directory links, to empty files or into .agents stay conservative', async t => {
  const cases = {
    outside: async ({ root, project }) => { await fs.writeFile(path.join(root, 'outside.md'), '# Outside\n'); return '../outside.md'; },
    absolute: async ({ project }) => path.join(project, 'docs/agent-rules.md'),
    'directory link': async ({ root, project }) => { await write(root, 'shared/rules.md', '# Shared\n'); await fs.symlink('../shared', path.join(project, 'linked')); return 'linked/rules.md'; },
    empty: async ({ project }) => { await write(project, 'docs/empty.md', ''); return 'docs/empty.md'; },
    reserved: async ({ project }) => { await write(project, '.agents/custom.md', '# Reserved\n'); return '.agents/custom.md'; },
  };
  for (const [name, prepare] of Object.entries(cases)) {
    const f = await fixture(t);
    const target = await prepare(f);
    await fs.unlink(path.join(f.project, 'AGENTS.md'));
    await fs.symlink(target, path.join(f.project, 'AGENTS.md'));
    const preview = await plan(f.home, f.project, both, { conflict: 'abort' });
    assert.ok(preview.conflicts.some(item => item.path === 'AGENTS.md'), name);
    await assert.rejects(apply(f.home, f.project, both, undefined, { conflict: 'abort' }), error => error.exitCode === 2, name);
    assert.equal(await link(f.project, 'AGENTS.md'), target, name);
  }
});

test('merge-resolved rules link conflicts are recorded so doctor is healthy right after sync', async t => {
  const { root, project, home } = await fixture(t);
  await fs.writeFile(path.join(root, 'outside.md'), '# Outside\n');
  await fs.unlink(path.join(project, 'AGENTS.md'));
  await fs.symlink('../outside.md', path.join(project, 'AGENTS.md'));
  await apply(home, project, both, undefined, { conflict: 'merge' });
  assert.equal(await link(project, 'AGENTS.md'), '.agents/rules/AGENTS.md');
  assert.equal(await fs.readFile(path.join(root, 'outside.md'), 'utf8'), '# Outside\n');
  const state = await readJSON(project, '.my-ai-infra/state.json');
  assert.equal(state.files['AGENTS.md'].target, '.agents/rules/AGENTS.md');
  await assertHealthy(home, project);
});
