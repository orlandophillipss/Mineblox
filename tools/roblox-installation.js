import { readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
export async function robloxExecutable(filename) {
  const root = path.join(process.env.LOCALAPPDATA, 'Roblox', 'Versions');
  const candidates = [];
  for (const directory of await readdir(root)) {
    const file = path.join(root, directory, filename);
    try {
      await access(file);
      candidates.push({ file, modified: (await stat(file)).mtimeMs });
    } catch {
      /* Old Studio directories may have been removed. */
    }
  }
  candidates.sort((a, b) => b.modified - a.modified);
  if (!candidates.length)
    throw new Error(`Roblox ${filename} is not installed`);
  return candidates[0].file;
}
