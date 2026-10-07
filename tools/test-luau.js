import { execFileSync } from 'node:child_process';
import path from 'node:path';
execFileSync(
  path.resolve(
    `.local/tools/luau/luau${process.platform === 'win32' ? '.exe' : ''}`,
  ),
  ['tests/client.luau'],
  { stdio: 'inherit', windowsHide: true },
);
