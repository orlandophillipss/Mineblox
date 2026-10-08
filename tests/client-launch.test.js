import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  clientArguments,
  offlineUuid,
  rulesAllow,
} from '../tools/client-launch.js';
import {
  localServerReady,
  stopOwnedServer,
  waitForLocalServer,
} from '../tools/client-server.js';

test('development identities use Minecraft offline UUIDs and reject invalid names', () => {
  assert.equal(offlineUuid('Notch'), 'b50ad385-829d-3141-a216-7e7d7539ba7f');
  assert.notEqual(offlineUuid('Notch'), offlineUuid('notch'));
  for (const name of [
    undefined,
    null,
    123,
    'ab',
    'a'.repeat(17),
    'name with space',
    '../player',
  ]) {
    assert.throws(() => offlineUuid(name), /player name/);
  }
});

test('official argument rules apply OS constraints, feature flags and ordered exclusions', () => {
  const windows = { name: 'windows', arch: 'amd64', version: '10.0' };
  assert.equal(rulesAllow(undefined, {}, windows), true);
  assert.equal(
    rulesAllow([{ action: 'allow', os: { name: 'linux' } }], {}, windows),
    false,
  );
  assert.equal(
    rulesAllow(
      [
        { action: 'allow' },
        {
          action: 'disallow',
          os: { name: 'windows', arch: 'amd.*', version: '^10\\.' },
        },
      ],
      {},
      windows,
    ),
    false,
  );
  assert.equal(
    rulesAllow(
      [
        { action: 'disallow' },
        {
          action: 'allow',
          features: { is_demo_user: false, is_quick_play_multiplayer: true },
        },
      ],
      { is_quick_play_multiplayer: true },
      windows,
    ),
    true,
  );
});

test('GUI launch expands native paths and multiplayer Quick Play without demo or other targets', () => {
  const metadata = {
    id: '1.21.4',
    mainClass: 'net.minecraft.client.main.Main',
    arguments: {
      jvm: [
        '-Djava.library.path=${natives_directory}',
        '-Dorg.lwjgl.system.SharedLibraryExtractPath=${natives_directory}',
        '-cp',
        '${classpath}',
      ],
      game: [
        '--username',
        '${auth_player_name}',
        '--gameDir',
        '${game_directory}',
        {
          rules: [{ action: 'allow', features: { is_demo_user: true } }],
          value: '--demo',
        },
        {
          rules: [
            { action: 'allow', features: { has_quick_plays_support: true } },
          ],
          value: ['--quickPlayPath', '${quickPlayPath}'],
        },
        {
          rules: [
            { action: 'allow', features: { is_quick_play_multiplayer: true } },
          ],
          value: ['--quickPlayMultiplayer', '${quickPlayMultiplayer}'],
        },
        {
          rules: [
            { action: 'allow', features: { is_quick_play_singleplayer: true } },
          ],
          value: ['--quickPlaySingleplayer', '${quickPlaySingleplayer}'],
        },
      ],
    },
  };
  const values = {
    auth_player_name: 'MinebloxJava',
    natives_directory: 'C:/private/native files',
    classpath: 'C:/client.jar;C:/library.jar',
    game_directory: 'C:/private/game',
    quickPlayPath: 'quickPlay/mineblox.json',
    quickPlayMultiplayer: '127.0.0.1:25565',
  };
  const args = clientArguments(metadata, values);
  assert.ok(args.includes('-Djava.library.path=C:/private/native files'));
  assert.ok(
    args.includes(
      '-Dorg.lwjgl.system.SharedLibraryExtractPath=C:/private/native files',
    ),
  );
  assert.equal(args[args.indexOf('-cp') + 1], values.classpath);
  assert.equal(
    args[args.indexOf('--quickPlayMultiplayer') + 1],
    '127.0.0.1:25565',
  );
  assert.equal(args[args.indexOf('--quickPlayPath') + 1], values.quickPlayPath);
  assert.ok(!args.includes('--demo'));
  assert.ok(!args.includes('--quickPlaySingleplayer'));
  assert.ok(!args.some((arg) => arg.includes('${')));
  assert.throws(
    () =>
      clientArguments(metadata, {
        ...values,
        quickPlayMultiplayer: 'example.com:25565',
      }),
    /local Mineblox/,
  );
  assert.throws(
    () => clientArguments({ ...metadata, id: '1.21.5' }, values),
    /pinned/,
  );
  assert.throws(
    () => clientArguments(metadata, { ...values, classpath: undefined }),
    /Missing Minecraft launch value/,
  );
});

test('server discovery distinguishes compatible, absent and incompatible listeners', async () => {
  assert.equal(
    await localServerReady(async (options) => {
      assert.equal(options.host, '127.0.0.1');
      assert.equal(options.port, 25565);
      assert.equal(options.version, '1.21.4');
      assert.ok(options.closeTimeout <= 2000 && options.noPongTimeout <= 1000);
      return { version: { protocol: 769 } };
    }),
    true,
  );
  assert.equal(
    await localServerReady(async () => {
      throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    }),
    false,
  );
  await assert.rejects(
    localServerReady(async () => ({ version: { protocol: 768 } })),
    /not compatible/,
  );
  const transportError = Object.assign(new Error('status timed out'), {
    code: 'ETIMEDOUT',
  });
  await assert.rejects(
    localServerReady(async () => {
      throw transportError;
    }),
    (error) => error === transportError,
  );
});

test('owned server shutdown sends its private stop command and waits for a clean exit', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      "const r=require('readline').createInterface({input:process.stdin});r.on('line',line=>{if(line==='stop'){console.log('saved');r.close();process.exit(0);}});console.log('ready');",
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
  );
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  try {
    await once(child.stdout, 'data');
    await stopOwnedServer(null);
    assert.equal(child.exitCode, null);
    await stopOwnedServer(child);
    assert.equal(child.exitCode, 0);
    assert.match(output, /saved/);
    await stopOwnedServer(child);
  } finally {
    if (child.exitCode === null) child.kill();
  }
});

test('startup waits through an early status disconnect but rejects version mismatch, exit and persistent failure', async () => {
  const child = { exitCode: null, signalCode: null };
  let attempts = 0;
  assert.equal(
    await waitForLocalServer(
      child,
      async () => {
        if (++attempts === 1)
          throw new Error(
            'Connection closed before the server sent a status response',
          );
        return true;
      },
      { timeout: 1000, interval: 1 },
    ),
    child,
  );
  assert.equal(attempts, 2);
  await assert.rejects(
    waitForLocalServer(
      child,
      () => localServerReady(async () => ({ version: { protocol: 768 } })),
      { timeout: 1000, interval: 1 },
    ),
    /not compatible/,
  );
  await assert.rejects(
    waitForLocalServer({ exitCode: 1, signalCode: null }, async () => true),
    /startup failed/,
  );
  const failure = new Error('status connection closed');
  await assert.rejects(
    waitForLocalServer(
      child,
      async () => {
        throw failure;
      },
      { timeout: 10, interval: 1 },
    ),
    (error) => error.message.includes('timed out') && error.cause === failure,
  );
});
