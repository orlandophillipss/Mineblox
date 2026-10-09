import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
export async function hostLockStatus(workspace = process.cwd()) {
  let lock;
  try {
    lock = JSON.parse(
      await readFile(path.resolve(workspace, '.local/host-lock.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!Number.isInteger(lock.pid) || lock.pid <= 0)
    throw new Error('Invalid Mineblox host lock PID');
  try {
    process.kill(lock.pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return null;
    throw error;
  }
  return { pid: lock.pid };
}
export async function acquireHostLock(workspace = process.cwd()) {
  const file = path.resolve(workspace, '.local/host-lock.json');
  await mkdir(path.dirname(file), { recursive: true });
  const instance = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(
        file,
        JSON.stringify({
          pid: process.pid,
          instance,
          startedAt: new Date().toISOString(),
        }),
        { flag: 'wx', mode: 0o600 },
      );
      return async () => {
        const lock = JSON.parse(await readFile(file, 'utf8'));
        if (lock.instance === instance) await unlink(file);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = JSON.parse(await readFile(file, 'utf8'));
      if (!Number.isInteger(previous.pid) || previous.pid <= 0)
        throw new Error('Invalid Mineblox host lock PID', { cause: error });
      try {
        process.kill(previous.pid, 0);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
        await unlink(file);
        continue;
      }
      throw new Error(
        'A Mineblox host is already running. Stop it before starting or switching worlds.',
        { cause: error },
      );
    }
  }
  throw new Error('Could not acquire the world host lock');
}
