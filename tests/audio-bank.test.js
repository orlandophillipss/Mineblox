import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolveEvents, compileAudioBanks } from '../tools/audio-bank.js';
import { validateBankManifest } from '../tools/audio-bank-config.js';
import { bindBankAssets } from '../tools/audio-bank-bind.js';
test('sound references preserve weighted selection, gain/pitch and detect cyclic or unsafe definitions', () => {
  const events = resolveEvents({
    child: {
      sounds: [
        { name: 'step/a', weight: 3 },
        { name: 'step/b', weight: 1 },
      ],
    },
    'block.stone.step': {
      sounds: [
        { name: 'child', type: 'event', weight: 2, pitch: 1.2, volume: 0.5 },
        { name: 'step/c', weight: 2 },
      ],
    },
  });
  const variants = events['minecraft:block.stone.step'].variants;
  assert.deepEqual(
    variants.map((v) => v.weight),
    [1.5, 0.5, 2],
  );
  assert.equal(variants[0].pitch, 1.2);
  assert.equal(variants[0].volume, 0.5);
  for (const definitions of [
    { a: { sounds: [{ name: 'a', type: 'event' }] } },
    { a: { sounds: ['../evil'] } },
    { a: { sounds: [{ name: 'file', attenuation_distance: Infinity }] } },
    { a: { sounds: [null] } },
  ])
    assert.throws(() => resolveEvents(definitions));
  assert.throws(
    () =>
      resolveEvents({ a: { sounds: [{ name: 'other:a', type: 'event' }] } }),
    /Missing/,
  );
});
test('untrusted bank manifests cannot create out-of-bank playback or invalid mappings', () => {
  const valid = {
    format: 'mineblox-audio-bank-v1',
    banks: { 1: { assetId: null, duration: 2, category: 'blocks' } },
    samples: { a: { bank: 1, start: 0.3, end: 0.5, duration: 0.2 } },
    events: {
      'minecraft:block.stone.step': {
        category: 'blocks',
        variants: [
          {
            sample: 'a',
            weight: 1,
            pitch: 1,
            volume: 1,
            attenuationDistance: 16,
          },
        ],
      },
    },
  };
  assert.equal(
    bindBankAssets(valid, { 1: 'rbxassetid://123' }).banks[1].assetId,
    'rbxassetid://123',
  );
  assert.equal(valid.banks[1].assetId, null);
  for (const mutate of [
    (m) => (m.samples.a.end = 3),
    (m) => (m.banks[1].duration = NaN),
    (m) =>
      (m.events['minecraft:block.stone.step'].variants[0].sample = 'missing'),
    (m) => (m.banks[1].assetId = 'https://untrusted'),
  ]) {
    const m = structuredClone(valid);
    mutate(m);
    assert.throws(() => validateBankManifest(m));
  }
  assert.throws(() => bindBankAssets(valid, { 2: 'rbxassetid://123' }));
});
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const available =
  spawnSync(ffmpeg, ['-version'], { windowsHide: true, stdio: 'ignore' })
    .status === 0 &&
  spawnSync(process.env.FFPROBE_PATH ?? 'ffprobe', ['-version'], {
    windowsHide: true,
    stdio: 'ignore',
  }).status === 0;
test(
  'owned tone fixtures compile to bounded lossless banks with measured offsets and silent guards',
  {
    skip: available
      ? false
      : 'optional FFmpeg/ffprobe compiler tools are not installed',
  },
  async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'mineblox-audio-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = path.join(root, 'source'),
      dest = path.join(root, 'output'),
      dir = path.join(source, 'assets/minecraft/sounds/test');
    await mkdir(dir, { recursive: true });
    execFileSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.1',
        '-c:a',
        'libvorbis',
        path.join(dir, 'a.ogg'),
      ],
      { windowsHide: true },
    );
    for (const n of ['b', 'c', 'd', 'music'])
      await copyFile(path.join(dir, 'a.ogg'), path.join(dir, n + '.ogg'));
    const soundsJson = path.join(root, 'sounds.json');
    await writeFile(
      soundsJson,
      JSON.stringify({
        'block.stone.step': {
          sounds: ['test/a', 'test/b', 'test/c', 'test/d'],
        },
        'music.test': { sounds: [{ name: 'test/music', stream: true }] },
      }),
    );
    const options = {
      sourceRoot: source,
      soundsJson,
      output: dest,
      rightsConfirmed: true,
      maxSeconds: 1.5,
    };
    await assert.rejects(
      compileAudioBanks({ ...options, rightsConfirmed: false }),
      /rights/,
    );
    const { manifest, report } = await compileAudioBanks(options);
    assert.equal(report.samples, 5);
    assert.equal(report.assets, 3);
    assert.ok(report.banks.every((b) => b.duration < 1.5));
    for (const s of Object.values(manifest.samples))
      assert.equal(s.start, s.startFrame / 48000);
    for (const b of report.banks) {
      const pcm = execFileSync(
        ffmpeg,
        [
          '-v',
          'error',
          '-i',
          path.join(dest, manifest.banks[b.bank].file),
          '-f',
          's16le',
          '-acodec',
          'pcm_s16le',
          '-',
        ],
        { windowsHide: true },
      );
      const samples = Object.values(manifest.samples).filter(
        (s) => s.bank === b.bank,
      );
      const audible = new Set();
      for (const s of samples)
        for (let i = s.startFrame; i < s.startFrame + s.frames; i++)
          audible.add(i);
      for (let i = 0; i < pcm.length / 2; i++)
        if (!audible.has(i))
          assert.equal(
            pcm.readInt16LE(i * 2),
            0,
            'padding contains no adjacent recording',
          );
    }
    assert.deepEqual(
      JSON.parse(await readFile(path.join(dest, 'manifest.json'), 'utf8')),
      manifest,
    );
  },
);
