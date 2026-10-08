import net from 'node:net';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { managerPipe, consoleCommand } from './manager-control.js';
import { offlineUuid } from './client-launch.js';
import { stopOwnedServer } from './client-server.js';
const profile = process.argv[2];
if (
  ![
    'server',
    'studio',
    'minecraft',
    'both',
    'quick',
    'named',
    'public',
  ].includes(profile)
)
  throw new Error('Unknown launch profile');
await mkdir('.local', { recursive: true });
await mkdir('.local/logs', { recursive: true });
const hostLog = createWriteStream('.local/logs/host-console.log', {
  flags: 'a',
});
const clients = new Map();
let closing = false,
  host,
  autoClientStarted = false;
let consoleLines = [],
  hostReady = false;
function capture(data) {
  hostLog.write(data.toString());
  for (const line of data.toString().split(/\r?\n/))
    if (line) {
      consoleLines.push(line.slice(0, 1000));
      if (line.startsWith('READY')) hostReady = true;
    }
  consoleLines = consoleLines.slice(-60);
  if (
    !autoClientStarted &&
    ['minecraft', 'both'].includes(profile) &&
    hostReady
  ) {
    autoClientStarted = true;
    client('MinebloxJava');
  }
}
const token = randomBytes(32).toString('hex');
const pipe = managerPipe();
if (process.platform !== 'win32') {
  try {
    const old = JSON.parse(await readFile('.local/manager.json', 'utf8'));
    try {
      process.kill(old.pid, 0);
      throw new Error('Manager is already running');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    await unlink(pipe);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function close() {
  if (closing) return;
  closing = true;
  for (const child of clients.values()) {
    if (child.stdin.writable) child.stdin.end('stop\n');
  }
  await stopOwnedServer(host);
  for (const child of clients.values())
    if (child.exitCode === null && child.signalCode === null) child.kill();
}
function client(name) {
  offlineUuid(name);
  if (
    [...clients.keys()].some(
      (key) => key.toLowerCase() === name.toLowerCase(),
    ) ||
    clients.size >= 4
  )
    throw new Error(
      'Client name already launched or four-client limit reached',
    );
  const child = spawn(
    process.execPath,
    [
      'tools/native-client.js',
      '--username',
      name,
      '--stay-open',
      '--managed-pipe',
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  clients.set(name, child);
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.stdin.on('error', capture);
  child.on('error', (error) => capture(error.message));
  child.once('exit', () => clients.delete(name));
  return { name, pid: child.pid };
}
const server = net.createServer((socket) => {
  let incoming = '';
  socket.setTimeout(20000, () => socket.destroy());
  socket.on('error', () => {});
  socket.on('data', (data) => {
    incoming += data.toString();
    if (Buffer.byteLength(incoming) > 2048) {
      socket.destroy();
      return;
    }
    if (!incoming.includes('\n')) return;
    socket.pause();
    void (async () => {
      try {
        const request = JSON.parse(incoming.trim());
        const presented = Buffer.from(request.token ?? '');
        const expected = Buffer.from(token);
        if (
          presented.length !== expected.length ||
          !timingSafeEqual(presented, expected)
        )
          throw new Error('Manager authorization failed');
        let result;
        if (request.action === 'status')
          result = {
            profile,
            hostPid: host?.pid,
            ready: hostReady,
            clients: [...clients].map(([name, child]) => ({
              name,
              pid: child.pid,
            })),
            console: consoleLines.slice(-40),
          };
        else if (request.action === 'console') {
          const command = consoleCommand(request.command);
          if (command === 'stop') {
            await close();
            result = { stopped: true };
          } else {
            if (!host?.stdin.writable) throw new Error('Host is unavailable');
            host.stdin.write('console ' + command + '\n');
            result = { sent: true };
          }
        } else if (request.action === 'client') result = client(request.name);
        else if (request.action === 'close-client') {
          const child = clients.get(request.name);
          if (!child) throw new Error('Unknown managed client');
          child.stdin.end('stop\n');
          result = { closing: true };
        } else if (request.action === 'stop') {
          await close();
          result = { stopped: true };
        } else throw new Error('Unknown manager action');
        socket.end(JSON.stringify(result));
        if (closing) server.close();
      } catch (error) {
        socket.end(JSON.stringify({ error: error.message }));
      }
    })();
  });
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(pipe, resolve);
});
if (process.platform !== 'win32') await chmod(pipe, 0o600);
await writeFile(
  '.local/manager.json',
  JSON.stringify({
    pid: process.pid,
    token,
    profile,
    startedAt: new Date().toISOString(),
  }),
  { mode: 0o600 },
);
const args = ['tools/launcher.js', '--managed-pipe'];
if (!['studio', 'both'].includes(profile)) args.push('--no-studio');
if (['quick', 'named'].includes(profile)) args.push('--tunnel', profile);
if (['named', 'public'].includes(profile)) {
  const settings = JSON.parse(
    await readFile('.local/deployment/settings.json', 'utf8'),
  );
  process.env.MINEBLOX_PUBLIC_URL = settings.url;
  process.env.MINEBLOX_TUNNEL_TOKEN_FILE = settings.tokenFile;
  if (settings.configFile)
    process.env.MINEBLOX_TUNNEL_CONFIG_FILE = settings.configFile;
  if (settings.tunnelId) process.env.MINEBLOX_TUNNEL_ID = settings.tunnelId;
  process.env.MINEBLOX_DEPLOYMENT = 'true';
}
host = spawn(process.execPath, args, {
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});
host.stdout.on('data', capture);
host.stderr.on('data', capture);
host.stdin.on('error', () => {});
host.once('error', (error) => {
  capture(error.message);
  void close().finally(() => server.close());
});
host.once('exit', () => {
  if (!closing) void close().finally(() => server.close());
});
server.once('close', async () => {
  await unlink('.local/manager.json').catch(() => {});
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => void close().finally(() => server.close()));
