import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import mineflayer from 'mineflayer';
import { createGateway } from '../bridge/gateway.js';
import { buildPlace } from './build-place.js';
import { openStudio } from './open-studio.js';

const children = [];
let gateway,
  minecraft,
  stopping = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await mkdir('.local/logs', { recursive: true });
const log = (name) =>
  createWriteStream(`.local/logs/${name}.log`, { flags: 'a' });
function launch(command, args, name, options = {}) {
  const output = log(name);
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    ...options,
  });
  child.stdout?.pipe(output);
  child.stderr?.pipe(output);
  child.once('error', (error) => {
    console.error(`${name}: ${error.message}`);
    void shutdown(1);
  });
  child.once('exit', (code) => {
    if (!stopping) {
      console.error(`${name} stopped (${code}). See .local/logs/${name}.log`);
      void shutdown(1);
    }
  });
  children.push(child);
  return child;
}
function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('Stopping the bridge and saving the Minecraft world…');
  await gateway?.close();
  if (minecraft?.stdin.writable) minecraft.stdin.write('stop\n');
  for (const child of children) if (child !== minecraft) child.kill();
  if (minecraft) {
    for (let i = 0; i < 100 && minecraft.exitCode === null; i++)
      await sleep(100);
    if (minecraft.exitCode === null) minecraft.kill();
  }
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => void shutdown());
try {
  if (await portOpen(25565))
    throw new Error(
      'Port 25565 is already in use. Stop the other development server before launching Mineblox.',
    );
  try {
    await access('.local/minecraft/server.jar');
  } catch {
    execFileSync(process.execPath, ['tools/minecraft.js', 'prepare'], {
      stdio: 'inherit',
      windowsHide: true,
    });
  }
  const eula = await readFile('.local/minecraft/eula.txt', 'utf8');
  if (!/^eula=true\s*$/m.test(eula))
    throw new Error(
      'Accept the Minecraft EULA in .local/minecraft/eula.txt before starting. https://www.minecraft.net/en-us/eula',
    );
  let previous;
  try {
    previous = JSON.parse(await readFile('.local/launcher.json', 'utf8'));
  } catch {
    /* First launch. */
  }
  const reusable =
    previous &&
    /^[a-f0-9]{64}$/.test(previous.token) &&
    /^http:\/\/127\.0\.0\.1:\d+$/.test(previous.url);
  const token = reusable ? previous.token : randomBytes(32).toString('hex');
  const preferredPort = reusable ? Number(new URL(previous.url).port) : 0;
  execFileSync(process.execPath, ['tools/minecraft.js', 'configure'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  const java = process.env.MINEBLOX_JAVA ?? 'java';
  console.log('Starting Minecraft Java 1.21.4…');
  minecraft = launch(
    java,
    [
      '-Xms512M',
      '-Xmx1G',
      '-jar',
      path.resolve('.local/minecraft/server.jar'),
      'nogui',
    ],
    'minecraft',
    { cwd: path.resolve('.local/minecraft') },
  );
  for (let i = 0; i < 180 && !(await portOpen(25565)); i++) await sleep(500);
  if (!(await portOpen(25565)))
    throw new Error(
      'Minecraft did not become ready; see .local/logs/minecraft.log',
    );
  const bridgeLog = log('bridge');
  let models = {};
  try {
    models = JSON.parse(
      await readFile('.local/roblox/model-catalog.json', 'utf8'),
    );
  } catch {
    /* Basic geometry remains available. */
  }
  gateway = createGateway({
    token,
    models,
    terrainRadius: 3,
    minecraft: { host: '127.0.0.1', port: 25565, version: '1.21.4' },
    createBot: mineflayer.createBot,
    log: (record) => bridgeLog.write(JSON.stringify(record) + '\n'),
  });
  await new Promise((resolve, reject) => {
    gateway.server.once('error', reject);
    gateway.server.listen(preferredPort, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${gateway.server.address().port}`;
  const health = await fetch(`${url}/health`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!health.ok) throw new Error('Local bridge health check failed');
  await writeFile(
    '.local/launcher.json',
    JSON.stringify({ url, token, localUrl: url }, null, 2),
  );
  const place = await buildPlace({ url, token });
  console.log('Opening the generated Roblox place…');
  if (!process.argv.includes('--no-studio')) {
    await openStudio(place);
    const automation = spawn(process.execPath, ['tools/studio-auto.js'], {
      stdio: 'inherit',
      windowsHide: true,
    });
    automation.on('error', (error) =>
      console.log(`Studio automation: ${error.message}`),
    );
  }
  console.log(
    'READY — In Studio, press Play. WASD moves; Space jumps; Ctrl sprints; Shift sneaks; Tab releases the cursor.',
  );
  console.log(
    'Keep this window open. Ctrl+C stops services and saves the world. Native Minecraft clients can join 127.0.0.1:25565.',
  );
  await writeFile(
    '.local/ready.json',
    JSON.stringify({ ready: true, place, startedAt: new Date().toISOString() }),
  );
  setInterval(() => {}, 10000);
} catch (error) {
  console.error(error.message);
  await shutdown(1);
}
