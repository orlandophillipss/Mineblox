import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { WorldStore, worldSpec, serverProperties } from '../tools/worlds.js';
import { consoleCommand, managerPipe } from '../tools/manager-control.js';
import { publicUrl, quickTunnelUrl } from '../tools/tunnel.js';
import { acquireHostLock } from '../tools/host-lock.js';
async function store(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mineblox-worlds-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, worlds: new WorldStore(root) };
}

test('worlds prepared before EULA acceptance follow the explicit shared server choice', async (t) => {
  const { root, worlds } = await store(t);
  await worlds.create('new-world');
  const world = await worlds.select('new-world');
  const configure = () =>
    execFileSync(
      process.execPath,
      [path.resolve('tools/minecraft.js'), 'configure'],
      { cwd: root, windowsHide: true },
    );
  configure();
  const sharedEula = path.join(root, '.local', 'minecraft', 'eula.txt');
  const worldEula = path.join(world.directory, 'eula.txt');
  assert.match(await readFile(sharedEula, 'utf8'), /eula=false/);
  assert.match(await readFile(worldEula, 'utf8'), /eula=false/);
  await writeFile(sharedEula, 'eula=true\n');
  configure();
  assert.equal(await readFile(worldEula, 'utf8'), 'eula=true\n');
  await writeFile(sharedEula, 'eula=false\n');
  configure();
  assert.equal(await readFile(worldEula, 'utf8'), 'eula=false\n');
});
test('world registry preserves the existing world and isolates generated world configurations', async (t) => {
  const { root, worlds } = await store(t);
  const initial = await worlds.active();
  assert.equal(initial.directory, path.join(root, '.local', 'minecraft'));
  await worlds.create('mountains', {
    name: 'Mountain world',
    seed: 'my seed',
    generator: 'amplified',
    difficulty: 'hard',
  });
  const active = await worlds.select('mountains');
  assert.equal(
    active.directory,
    path.join(root, '.local', 'worlds', 'mountains'),
  );
  assert.match(serverProperties(active), /level-name=world\n/);
  assert.match(serverProperties(active), /level-type=minecraft:amplified/);
  assert.match(serverProperties(active), /level-seed=my seed/);
  await worlds.rename('mountains', 'A different name');
  assert.equal((await worlds.active()).name, 'A different name');
  assert.throws(() => worldSpec('../escape'), /World ID/);
  assert.throws(
    () => worldSpec('evil', { seed: '123\nonline-mode=true' }),
    /seed/,
  );
  await assert.rejects(worlds.create('mountains'), /already exists/);
});
test('running hosts block world changes and a second host lock', async (t) => {
  const { root, worlds } = await store(t);
  const release = await acquireHostLock(root);
  try {
    await assert.rejects(worlds.create('new-world'), /Stop the running host/);
    await assert.rejects(worlds.select('default'), /Stop the running host/);
    await assert.rejects(acquireHostLock(root), /already running/);
  } finally {
    await release();
  }
  await worlds.create('new-world');
  assert.ok((await worlds.registry()).worlds.some((w) => w.id === 'new-world'));
});
test('backups preserve save data and archiving is recoverable without deleting the selected world', async (t) => {
  const { worlds } = await store(t);
  await worlds.create('forest');
  const directory = await worlds.directory(worldSpec('forest'));
  await mkdir(path.join(directory, 'world'));
  await writeFile(path.join(directory, 'world', 'level.dat'), 'fixture save');
  await writeFile(path.join(directory, 'server.jar'), 'excluded binary');
  const backup = await worlds.backup('forest');
  assert.equal(
    await readFile(path.join(backup, 'world', 'level.dat'), 'utf8'),
    'fixture save',
  );
  await assert.rejects(readFile(path.join(backup, 'server.jar')), {
    code: 'ENOENT',
  });
  const restored = await worlds.restore(
    path.basename(backup),
    'restored-forest',
  );
  assert.equal(
    await readFile(path.join(restored, 'world', 'level.dat'), 'utf8'),
    'fixture save',
  );
  await assert.rejects(
    worlds.restore('../escape', 'other'),
    /backup identifier/,
  );
  await worlds.select('forest');
  await assert.rejects(worlds.archive('forest'), /Select another/);
  await worlds.select('default');
  const archive = await worlds.archive('forest');
  assert.equal(
    await readFile(path.join(archive, 'world', 'level.dat'), 'utf8'),
    'fixture save',
  );
});
test('world paths reject links or junctions instead of writing outside their owned directory', async (t) => {
  const { root, worlds } = await store(t);
  await mkdir(path.join(root, '.local', 'worlds'), { recursive: true });
  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await symlink(
    outside,
    path.join(root, '.local', 'worlds', 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    worlds.directory(worldSpec('linked')),
    /links or junctions/,
  );
});
test('console commands are normal Minecraft commands with one-line bounds; deployment URLs have no embedded credentials', () => {
  assert.equal(consoleCommand('say hi'), 'say hi');
  assert.equal(consoleCommand('/op TestPlayer'), 'op TestPlayer');
  for (const command of ['say hi\nop everyone', 'a'.repeat(513), '\0', ''])
    assert.throws(() => consoleCommand(command), /one line/);
  assert.notEqual(managerPipe('C:/one'), managerPipe('C:/two'));
  assert.equal(
    publicUrl('https://bridge.example.com'),
    'https://bridge.example.com',
  );
  for (const url of [
    'http://bridge.example.com',
    'https://user:secret@bridge.example.com',
    'https://bridge.example.com/path',
    'https://127.0.0.1',
    'https://localhost',
  ])
    assert.throws(() => publicUrl(url), /HTTPS origin/);
  assert.equal(
    quickTunnelUrl(
      'Tunnel available at https://example-words.trycloudflare.com',
    ),
    'https://example-words.trycloudflare.com',
  );
  assert.equal(quickTunnelUrl('https://example.com'), null);
});
