import { spawn } from 'node:child_process';
import path from 'node:path';
import { robloxExecutable } from './roblox-installation.js';
const child = spawn(
  await robloxExecutable('RobloxStudioBeta.exe'),
  [path.resolve('.local/roblox/Mineblox.rbxlx')],
  { detached: true, stdio: 'ignore', windowsHide: false },
);
child.unref();
