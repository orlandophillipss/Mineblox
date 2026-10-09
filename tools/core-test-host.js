// An isolated, reproducible client test world. Never uses the selected user world.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import net from 'node:net';
import path from 'node:path';
import mineflayer from 'mineflayer';
import { createGateway } from '../bridge/gateway.js';
import { offlineUuid } from './client-launch.js';
import { consoleCommand } from './manager-control.js';
const recordFile = '.local/core-test-control.json';
if (process.argv[2] === 'command') {
  const command = consoleCommand(process.argv.slice(3).join(' '));
  const record = JSON.parse(await readFile(recordFile, 'utf8'));
  await new Promise((resolve, reject) => {
    const socket = net.connect(record.pipe);
    let reply = '';
    socket.setTimeout(20000, () =>
      socket.destroy(new Error('Test host command timeout')),
    );
    socket.on('error', reject);
    socket.on('connect', () =>
      socket.write(JSON.stringify({ token: record.token, command }) + '\n'),
    );
    socket.on('data', (b) => {
      reply += b;
      if (reply.length > 2048)
        socket.destroy(new Error('Oversized test reply'));
    });
    socket.on('end', () => {
      if (reply.includes('"ok":true')) resolve();
      else reject(new Error('Test host rejected command'));
    });
  });
  console.log('Test host command accepted');
} else {
  const root = path.resolve('.local/core-test');
  await mkdir(root, { recursive: true });
  const eula = await readFile('.local/minecraft/eula.txt', 'utf8');
  if (!/^eula=true\s*$/m.test(eula))
    throw new Error(
      'Explicit Minecraft EULA acceptance is required before this test',
    );
  await writeFile(path.join(root, 'eula.txt'), eula);
  await writeFile(
    path.join(root, 'server.properties'),
    'server-ip=127.0.0.1\nserver-port=25566\nonline-mode=false\nlevel-name=world\nlevel-type=minecraft:flat\nlevel-seed=12345\ngamemode=survival\ndifficulty=normal\nspawn-protection=0\nview-distance=5\nsimulation-distance=5\nmax-players=8\n',
  );
  await writeFile(
    path.join(root, 'ops.json'),
    JSON.stringify([
      {
        uuid: offlineUuid('CoreObserver'),
        name: 'CoreObserver',
        level: 4,
        bypassesPlayerLimit: false,
      },
    ]),
  );
  const mc = spawn(
    'java',
    [
      '-Xms256M',
      '-Xmx768M',
      '-jar',
      path.resolve('.local/minecraft/server.jar'),
      'nogui',
    ],
    { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let gateway,
    controlServer,
    stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    controlServer?.close();
    await gateway?.close();
    mc.stdin.end('stop\n');
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  mc.stderr.pipe(process.stderr);
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Test Minecraft startup timed out')),
      90000,
    );
    mc.stdout.on('data', (b) => {
      process.stdout.write(b);
      if (b.toString().includes('Done (')) {
        clearTimeout(timer);
        resolve();
      }
    });
    mc.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    mc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Test Minecraft exited ${code}`));
    });
  });
  try {
    await ready;
    mc.stdin.write(
      'gamerule doMobSpawning false\ngamerule doDaylightCycle false\ntime set day\nsetworldspawn 0 -60 0\ngamerule spawnRadius 0\n',
    );
    const models = JSON.parse(
      await readFile('.local/roblox/model-catalog.json', 'utf8'),
    );
    const token = randomBytes(32).toString('hex');
    gateway = createGateway({
      token,
      minecraft: { host: '127.0.0.1', port: 25566, version: '1.21.4' },
      createBot: mineflayer.createBot,
      models,
      terrainRadius: 3,
    });
    await new Promise((resolve) =>
      gateway.server.listen(0, '127.0.0.1', resolve),
    );
    const url = `http://127.0.0.1:${gateway.server.address().port}`;
    await writeFile(
      '.local/client-test-connection.json',
      JSON.stringify({ url, token }),
    );
    await writeFile(
      '.local/roblox/DevelopmentConfig.luau',
      `return {url=${JSON.stringify(url)},token=${JSON.stringify(token)}}\n`,
    );
    const pipe =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\mineblox-test-${process.pid}`
        : path.join(root, `control-${process.pid}.sock`);
    controlServer = net.createServer((socket) => {
      let data = '';
      socket.setTimeout(5000, () => socket.destroy());
      socket.on('data', (b) => {
        data += b;
        if (data.length > 2048) {
          socket.destroy();
          return;
        }
        if (!data.endsWith('\n')) return;
        try {
          const request = JSON.parse(data);
          if (request.token !== token) throw new Error('Unauthorized');
          const command = consoleCommand(request.command);
          socket.end('{"ok":true}\n');
          if (command === 'stop') void stop();
          else mc.stdin.write(command + '\n');
        } catch {
          socket.end('{"ok":false}\n');
        }
      });
      socket.on('error', () => {});
    });
    await new Promise((resolve, reject) => {
      controlServer.once('error', reject);
      controlServer.listen(pipe, resolve);
    });
    await writeFile(
      recordFile,
      JSON.stringify({ pid: process.pid, pipe, token }),
    );
    console.log(
      'CORE_TEST_READY: isolated Minecraft on loopback port 25566; private Studio configuration written.',
    );
    const lines = createInterface({ input: process.stdin });
    lines.on('line', (line) => {
      try {
        const command = consoleCommand(line);
        if (command === 'stop') void stop();
        else mc.stdin.write(command + '\n');
      } catch (error) {
        console.error(error.message);
      }
    });
    mc.once('exit', async () => {
      lines.close();
      controlServer?.close();
      await gateway?.close();
      await unlink(recordFile).catch(() => {});
    });
  } catch (error) {
    console.error(error.message);
    await stop();
    process.exitCode = 1;
  }
}
