import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const executable = path.resolve(
  `.local/tools/luau/luau-compile${process.platform === 'win32' ? '.exe' : ''}`,
);
const sources = (await readdir('roblox'))
  .filter((f) => f.endsWith('.luau'))
  .map((f) => path.resolve('roblox', f));
execFileSync(executable, [...sources, '--null'], {
  stdio: 'inherit',
  windowsHide: true,
});
