import net from 'node:net';
import path from 'node:path';
import { readFile, writeFile, unlink, chmod } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { hostPipe, consoleCommand } from './manager-control.js';

// Every launcher exposes the same small, local, authenticated management lane.
// This also covers hosts started by the native client without manager-host.js.
export async function createHostControl(
  { status, console: sendConsole, stop },
  workspace = process.cwd(),
) {
  const file = path.resolve(workspace, '.local/host-control.json');
  const pipe = hostPipe(workspace);
  const token = randomBytes(32).toString('hex');
  if (process.platform !== 'win32')
    await unlink(pipe).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  const sockets = new Set();
  const server = net.createServer((socket) => {
    if (sockets.size >= 8) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(5000, () => socket.destroy());
    let incoming = '';
    socket.on('data', (data) => {
      incoming += data.toString();
      if (Buffer.byteLength(incoming) > 2048) {
        socket.destroy();
        return;
      }
      if (!incoming.includes('\n')) return;
      socket.pause();
      try {
        const request = JSON.parse(incoming.trim());
        const presented = Buffer.from(
          typeof request.token === 'string' ? request.token : '',
        );
        const expected = Buffer.from(token);
        if (
          presented.length !== expected.length ||
          !timingSafeEqual(presented, expected)
        )
          throw new Error('Host authorization failed');
        if (request.action === 'status') socket.end(JSON.stringify(status()));
        else if (
          request.action === 'stop' ||
          (request.action === 'console' &&
            consoleCommand(request.command) === 'stop')
        ) {
          socket.end(JSON.stringify({ stopping: true }));
          setImmediate(stop);
        } else if (request.action === 'console') {
          sendConsole(consoleCommand(request.command));
          socket.end(JSON.stringify({ sent: true }));
        } else
          throw new Error('Use a managed launch for native client controls');
      } catch (error) {
        socket.end(JSON.stringify({ error: error.message }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(pipe, resolve);
  });
  if (process.platform !== 'win32') await chmod(pipe, 0o600);
  await writeFile(file, JSON.stringify({ pid: process.pid, token }), {
    mode: 0o600,
  });
  return {
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      const current = JSON.parse(
        await readFile(file, 'utf8').catch((error) => {
          if (error.code === 'ENOENT') return '{}';
          throw error;
        }),
      );
      if (current.token === token) await unlink(file);
    },
  };
}
