// Bundle the pinned dependency with one documented correctness fix; never mutate a shared install.
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
