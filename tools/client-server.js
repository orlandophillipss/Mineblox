import protocol from 'minecraft-protocol';
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import path from 'node:path';

export async function localServerReady(ping = protocol.ping) {
  try {
    const status = await ping({
      host: '127.0.0.1',
      port: 25565,
      version: '1.21.4',
      closeTimeout: 2000,
      noPongTimeout: 1000,
    });
    if (status.version?.protocol !== 769)
      throw Object.assign(
        new Error(
          'The local server is not compatible with Minecraft Java 1.21.4',
        ),
        { code: 'MINEBLOX_INCOMPATIBLE_SERVER' },
      );
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') return false;
    throw error;
  }
}
export async function stopOwnedServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  console.log(
    'Saving and stopping the server started by the Minecraft client launcher…',
  );
  await new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      child.stdin.off('error', pipeError);
      resolve();
    };
    const pipeError = () => {
      /* The exit event or bounded timeout completes cleanup. */
    };
    const timer = setTimeout(() => {
      child.kill();
      child.off('exit', done);
      child.stdin.off('error', pipeError);
      reject(
        new Error(
          'Local server shutdown timed out; inspect .local/native-client/server.log',
        ),
      );
    }, 15000);
    child.once('exit', done);
    child.stdin.on('error', pipeError);
    child.stdin.end('stop\n');
  });
}
export async function waitForLocalServer(
  child,
  ready = localServerReady,
  { timeout = 95000, interval = 500 } = {},
) {
  const started = Date.now();
  let lastStatusError;
  while (Date.now() - started < timeout) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        'Local server startup failed; see .local/logs/minecraft.log and .local/native-client/server.log',
      );
    try {
      if (await ready()) return child;
    } catch (error) {
      if (error.code === 'MINEBLOX_INCOMPATIBLE_SERVER') throw error;
      // Our starting server can accept TCP before its status handler is ready.
      // Existing listeners are checked before spawning and never enter this retry.
      lastStatusError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
    if (
      Date.now() - started > 15000 &&
      Math.floor((Date.now() - started) / 500) % 30 === 0
    )
      console.log('Waiting for the local server…');
  }
  throw new Error(
    'Local server startup timed out; see .local/logs/minecraft.log and .local/native-client/server.log',
    { cause: lastStatusError },
  );
}
export async function ensureLocalServer(start) {
  if (await localServerReady()) return null;
  if (!start)
    throw new Error(
      'Local server is not running. Start Mineblox.bat or use Minecraft.bat.',
    );
  console.log('Starting the local Minecraft server and bridge…');
  const log = openSync('.local/native-client/server.log', 'a');
  let child;
  try {
    child = spawn(
      process.execPath,
      [path.resolve('tools/launcher.js'), '--no-studio', '--managed-pipe'],
      { stdio: ['pipe', log, log], windowsHide: true },
    );
  } finally {
    closeSync(log);
  }
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  try {
    return await waitForLocalServer(child);
  } catch (error) {
    await stopOwnedServer(child);
    throw error;
  }
}
