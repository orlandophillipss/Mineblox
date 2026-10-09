import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { control, hostPipe } from '../tools/manager-control.js';
import { acquireHostLock } from '../tools/host-lock.js';
import { createHostControl } from '../tools/host-control.js';
async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mineblox-host-'));
  await mkdir(path.join(root, '.local'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test('manager detects an older live host even without its manager pipe', async (t) => {
  const root = await workspace(t);
  const release = await acquireHostLock(root);
  try {
    const status = await control({ action: 'status' }, root);
    assert.equal(status.stopped, false);
    assert.equal(status.hostPid, process.pid);
    assert.equal(status.controllable, false);
    await assert.rejects(
      control({ action: 'stop' }, root),
      /original launch terminal/,
    );
  } finally {
    await release();
  }
  assert.equal((await control({ action: 'status' }, root)).stopped, true);
});
test('standalone host supports authenticated console and graceful stop from the manager', async (t) => {
  const root = await workspace(t);
  const commands = [];
  let stopped = 0;
  const host = await createHostControl(
    {
      status: () => ({ stopped: false, ready: true }),
      console: (c) => commands.push(c),
      stop: () => stopped++,
    },
    root,
  );
  try {
    assert.equal((await control({ action: 'status' }, root)).ready, true);
    await control({ action: 'console', command: 'say hi' }, root);
    assert.deepEqual(commands, ['say hi']);
    await assert.rejects(
      control({ action: 'console', command: 'say hi\nop everyone' }, root),
      /one line/,
    );
    const original = await readFile(
      path.join(root, '.local/host-control.json'),
      'utf8',
    );
    await writeFile(
      path.join(root, '.local/host-control.json'),
      JSON.stringify({ token: 'wrong' }),
    );
    await assert.rejects(control({ action: 'stop' }, root), /authorization/);
    assert.equal(stopped, 0);
    await writeFile(path.join(root, '.local/host-control.json'), original);
    assert.deepEqual(await control({ action: 'stop' }, root), {
      stopping: true,
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopped, 1);
    await control({ action: 'console', command: '/stop' }, root);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopped, 2);
    assert.deepEqual(commands, ['say hi']);
  } finally {
    await host.close();
  }
  assert.equal((await control({ action: 'status' }, root)).stopped, true);
});
test('host management rejects oversized input without running commands', async (t) => {
  const root = await workspace(t);
  let calls = 0;
  const host = await createHostControl(
    { status: () => ({}), console: () => calls++, stop: () => calls++ },
    root,
  );
  try {
    await new Promise((resolve, reject) => {
      const socket = net.connect(hostPipe(root));
      socket.setTimeout(2000, () => {
        socket.destroy();
        reject(new Error('Oversized request was not closed'));
      });
      socket.on('error', reject);
      socket.on('connect', () => socket.write('x'.repeat(4096)));
      socket.on('close', resolve);
    });
    assert.equal(calls, 0);
  } finally {
    await host.close();
  }
});
test('invalid host lock PID cannot be treated as a process group', async (t) => {
  const root = await workspace(t);
  await writeFile(
    path.join(root, '.local/host-lock.json'),
    JSON.stringify({ pid: -1 }),
  );
  await assert.rejects(control({ action: 'status' }, root), /Invalid.*PID/);
  await assert.rejects(acquireHostLock(root), /Invalid.*PID/);
});

test(
  'interactive manager accepts Stop host and explains unknown menu input',
  { timeout: 8000 },
  async (t) => {
    const root = await workspace(t);
    const child = spawn(process.execPath, [path.resolve('tools/manager.js')], {
      cwd: root,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    let output = '',
      pending = '',
      stage = 0;
    const inputs = ['Stop host\n', 'unknown-option\n', '0\n'];
    child.stdout.on('data', (data) => {
      output += data;
      pending += data;
      if (pending.includes('Choose: ') && stage < inputs.length) {
        pending = '';
        child.stdin.write(inputs[stage++]);
      }
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
    assert.equal(code, 0, output);
    assert.match(output, /Host is already stopped/);
    assert.match(output, /Unknown option/);
  },
);
