import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { robloxExecutable } from './roblox-installation.js';
export async function openStudio(place) {
  const absolute = path.resolve(place);
  let saved;
  try {
    saved = JSON.parse(await readFile('.local/studio-process.json', 'utf8'));
  } catch {
    /* First managed window. */
  }
  if (saved && Number.isInteger(saved.pid) && saved.place === absolute) {
    const literal = absolute.replaceAll("'", "''");
    const check = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$p=Get-Process -Id ${saved.pid} -ErrorAction SilentlyContinue; if($p -and $p.ProcessName -eq 'RobloxStudioBeta' -and $p.MainWindowTitle.StartsWith('${literal}',[System.StringComparison]::OrdinalIgnoreCase)){Write-Output 'reuse'}`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    if (check.trim() === 'reuse') {
      try {
        execFileSync(process.execPath, ['tools/studio-smoke.js', 'stop'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        execFileSync(process.execPath, ['tools/studio-sync.js'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        console.log(
          'Reusing the existing Mineblox Studio window with updated scripts.',
        );
      } catch {
        console.log(
          'Reusing the Mineblox window. Enable Studio MCP to update it automatically, or reopen the generated place manually.',
        );
      }
      return saved.pid;
    }
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
