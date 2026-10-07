import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { clearRequiredPorts, findStudio } from '../tools/startup-processes.js';
import { selectStudio } from '../tools/studio-selection.js';

const windowsOnly = { skip: process.platform !== 'win32' };
test('Studio MCP selection recovers stale IDs, excludes unrelated places and rejects ambiguity', () => {
  const current = { id: 'current', name: 'Mineblox.rbxlx' };
  const other = { id: 'other', name: 'Unrelated.rbxlx' };
  assert.equal(selectStudio([current, other], 'closed'), 'current');
  assert.equal(selectStudio([current, other], 'other'), 'current');
  assert.throws(() => selectStudio([other], 'other'), /not connected/);
  assert.throws(
    () =>
      selectStudio([current, { id: 'second', name: current.name }], 'closed'),
    /Multiple/,
  );
  assert.equal(
    selectStudio([current, { id: 'second', name: current.name }], 'second'),
    'second',
  );
});
test('startup rejects invalid cleanup ports before inspecting processes', () => {
  for (const ports of [[], [0], [-1], [65536], [1.5], [null], ['25565']]) {
    assert.throws(
      () => clearRequiredPorts(ports),
      /Invalid required startup ports/,
    );
  }
});
test(
  'an absent Studio window and stale saved PID are normal query results',
  windowsOnly,
  () => {
    assert.equal(
      findStudio(
        `C:/nonexistent-mineblox-${randomUUID()}/Mineblox.rbxlx`,
        2147483647,
      ),
      null,
    );
  },
);

async function listener() {
  const child = spawn(
    process.execPath,
    [
      '-e',
      "const net=require('net');const s=net.createServer(c=>c.end());s.listen(0,'127.0.0.1',()=>console.log(s.address().port));",
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Listener fixture startup timed out')),
        10000,
      );
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.stdout.once('data', (data) => {
        clearTimeout(timer);
        resolve(Number(data.toString().trim()));
      });
    });
    assert.ok(port > 0 && port <= 65535);
    return { child, port };
  } catch (error) {
    child.kill();
    throw error;
  }
}
function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('error', reject);
  });
}
test(
  'cleanup stops only the requested listener, preserves unrelated ports, and is repeatable',
  windowsOnly,
  async () => {
    const target = await listener();
    let unrelated;
    try {
      unrelated = await listener();
      const stopped = clearRequiredPorts([target.port, target.port]);
      assert.equal(stopped.length, 1);
      assert.equal(stopped[0].pid, target.child.pid);
      assert.deepEqual(stopped[0].ports, [target.port]);
      await assert.rejects(connect(target.port));
      await connect(unrelated.port);
      assert.deepEqual(clearRequiredPorts([target.port]), []);
    } finally {
      target.child.kill();
      unrelated?.child.kill();
    }
  },
);
test(
  'cleanup refuses to terminate its own launcher process',
  windowsOnly,
  async () => {
    const server = net.createServer((socket) => socket.end());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      assert.throws(
        () => clearRequiredPorts([server.address().port]),
        /protected process/,
      );
      await connect(server.address().port);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
