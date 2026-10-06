import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

async function check(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', '.git', '.local'].includes(item.name)) continue;
    const file = `${path}/${item.name}`;
    if (item.isDirectory()) await check(file);
    else if (file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], {
        stdio: 'inherit',
      });
      if (result.error || result.status !== 0)
        throw new Error(`Syntax check failed: ${file}`);
    }
  }
}
await check('.');
console.log(
  'All JavaScript sources passed syntax checks. No compilation is needed.',
);
