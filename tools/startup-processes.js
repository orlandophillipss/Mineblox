import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('./windows-processes.ps1', import.meta.url),
);
function query(args) {
  try {
    return JSON.parse(
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
        { encoding: 'utf8', windowsHide: true, timeout: 30000 },
      ).trim(),
    );
  } catch (error) {
    throw new Error(
      `Startup process check failed: ${String(error.stderr || error.message).trim()}`,
      { cause: error },
    );
  }
}
export function findStudio(place, preferredId = 0) {
  if (process.platform !== 'win32') return null;
  return query([
    '-Mode',
    'FindStudio',
    '-Place',
    path.resolve(place),
    '-PreferredId',
    String(
      Number.isInteger(preferredId) &&
        preferredId > 0 &&
        preferredId <= 2147483647
        ? preferredId
        : 0,
    ),
  ]);
}
export function clearRequiredPorts(ports) {
  const required = [...new Set(ports.filter((port) => port !== 0))];
  if (
    !required.length ||
    required.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)
  )
    throw new Error('Invalid required startup ports');
  if (process.platform !== 'win32')
    throw new Error(
      'Automatic port cleanup is supported by the Windows batch launcher',
    );
  return query([
    '-Mode',
    'ClearPorts',
    '-Ports',
    required.join(','),
    '-ProtectedId',
    String(process.pid),
  ]);
}
