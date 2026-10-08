import net from 'node:net';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export function managerPipe(workspace = process.cwd()) {
  const hash = createHash('sha256')
    .update(path.resolve(workspace))
    .digest('hex')
    .slice(0, 20);
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\mineblox-${hash}`
    : path.resolve(workspace, '.local/manager.sock');
}
export async function control(request, workspace = process.cwd()) {
  const record = JSON.parse(
    await readFile(path.resolve(workspace, '.local/manager.json'), 'utf8'),
  );
  const payload = JSON.stringify({ ...request, token: record.token }) + '\n';
  if (Buffer.byteLength(payload) > 2048)
    throw new Error('Manager command is too large');
  return new Promise((resolve, reject) => {
    const socket = net.connect(managerPipe(workspace));
    let response = '';
    socket.setTimeout(20000, () =>
      socket.destroy(new Error('Manager request timed out')),
    );
    socket.on('error', reject);
    socket.on('connect', () => socket.write(payload));
    socket.on('data', (data) => {
      response += data.toString();
      if (response.length > 65536)
        socket.destroy(new Error('Manager reply exceeds its budget'));
    });
    socket.on('end', () => {
      try {
        const result = JSON.parse(response);
        if (result.error) reject(new Error(result.error));
        else resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}
export function consoleCommand(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 512 ||
    [...value].some((c) => c.charCodeAt(0) < 32)
  )
    throw new Error('Console command must be one line of 1–512 characters');
  return value.replace(/^\//, '');
}
