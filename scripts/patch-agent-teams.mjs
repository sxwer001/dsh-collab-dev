// Bundle documented correctness fixes; never mutate a shared dependency install.
import { readFile, realpath, writeFile, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));
const manifest = await realpath(require.resolve('@nanmicoder/dsh-agent-teams/package.json'));
if (!manifest.startsWith(root + path.sep)) throw new Error('Refusing to patch a dependency outside this project');
if (JSON.parse(await readFile(manifest, 'utf8')).version !== '0.1.23') throw new Error('Patch only supports AgentTeams 0.1.23');
const file = path.join(path.dirname(manifest), 'lib/quality-gates.js');
const old = 'export function bindReviewToRevision(team, task, binding) {\n    const target = reviewedTargetOf(team, task);';
const fixed = 'export function bindReviewToRevision(team, task, binding) {\n    const target = reviewedTargetOf(team, task) ?? (taskKindOf(task) === \'requirements\' ? task : undefined);';
const source = await readFile(file, 'utf8');
if (!source.includes(fixed)) {
  if (!source.includes(old)) throw new Error('Unexpected upstream source; do not apply this patch blindly');
  await writeFile(file + '.collab.tmp', source.replace(old, fixed));
  await rename(file + '.collab.tmp', file);
}
console.log('AgentTeams requirements snapshot fix ready for bundling.');
const toolsFile = path.join(path.dirname(manifest), 'lib/tools.js');
const before = '            requireStagedTeam(fresh);\n            // A staged removal';
const after = `            requireStagedTeam(fresh);
            // Collab-Dev stages quality tasks sequentially. Never approve a partial upload.
            const collabCount = /^协作计划：(\\d+) 项任务\\n/.exec(fresh.description ?? '');
            if (fresh.profile?.name === 'collab-dev' && collabCount && fresh.tasks.length !== Number(collabCount[1])) {
                throw new Error('协作计划尚未完整创建，不能批准运行；请检查草稿或丢弃后重新创建。');
            }
            // A staged removal`;
const toolsSource = await readFile(toolsFile, 'utf8');
if (!toolsSource.includes(after)) {
  if (toolsSource.split(before).length !== 2) throw new Error('Unexpected approval source; do not apply this patch blindly');
  await writeFile(toolsFile + '.collab.tmp', toolsSource.replace(before, after));
  await rename(toolsFile + '.collab.tmp', toolsFile);
}
console.log('AgentTeams incomplete Collab-Dev plan approval guard ready for bundling.');
