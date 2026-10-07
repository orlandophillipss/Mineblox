import { spawn } from 'node:child_process';
import { robloxExecutable } from './roblox-installation.js';
// Avoid a stale or malformed Roblox-generated mcp.bat after Studio updates.
const child = spawn(
  await robloxExecutable('StudioMCP.exe'),
  process.argv.slice(2),
  { stdio: 'inherit', windowsHide: true },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
