import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { robloxExecutable } from './roblox-installation.js';
import { findStudio } from './startup-processes.js';
export async function openStudio(place) {
  const absolute = path.resolve(place);
  let saved;
  try {
    saved = JSON.parse(await readFile('.local/studio-process.json', 'utf8'));
  } catch {
    /* First managed window. */
  }
  const existing = findStudio(
    absolute,
    saved?.place === absolute ? saved.pid : 0,
  );
  if (existing) {
    await writeFile(
      '.local/studio-process.json',
      JSON.stringify({ pid: existing, place: absolute }),
    );
    try {
      execFileSync(process.execPath, ['tools/studio-sync.js'], {
        stdio: 'pipe',
        windowsHide: true,
      });
      console.log(
        'Reusing the existing Mineblox Studio window with updated scripts.',
      );
    } catch (error) {
      console.log(
        `Studio script update failed: ${String(error.stderr || error.message).trim()}`,
      );
      console.log(
        'Reusing the Mineblox window. Enable Studio MCP to update it automatically, or reopen the generated place manually.',
      );
    }
    return existing;
  }
  const studio = spawn(
    await robloxExecutable('RobloxStudioBeta.exe'),
    [absolute],
    { detached: true, stdio: 'ignore', windowsHide: false },
  );
  await new Promise((resolve, reject) => {
    studio.once('spawn', resolve);
    studio.once('error', reject);
  });
  await writeFile(
    '.local/studio-process.json',
    JSON.stringify({ pid: studio.pid, place: absolute }),
  );
  studio.unref();
  return studio.pid;
}
