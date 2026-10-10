// Reproducible, project-owned sine fixtures; no Minecraft recordings downloaded.
import { mkdir, writeFile, copyFile, stat, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { compileAudioBanks } from './audio-bank.js';
const root = path.resolve('.local/audio-benchmark'),
  source = path.join(root, 'source'),
  sounds = path.join(source, 'assets/minecraft/sounds/owned');
await mkdir(sounds, { recursive: true });
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
execFileSync(
  ffmpeg,
  [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=0.12',
    '-c:a',
    'libvorbis',
    path.join(sounds, '0.ogg'),
  ],
  { windowsHide: true },
);
for (let i = 1; i < 32; i++)
  await copyFile(path.join(sounds, '0.ogg'), path.join(sounds, `${i}.ogg`));
const definitions = {
  'block.stone.step': {
    sounds: Array.from({ length: 32 }, (_, i) => ({
      name: `owned/${i}`,
      weight: (i % 3) + 1,
      volume: 0.8,
      pitch: i % 2 ? 1.1 : 1,
    })),
  },
};
const soundsJson = path.join(root, 'sounds.json');
await writeFile(soundsJson, JSON.stringify(definitions));
const started = performance.now(),
  before = process.memoryUsage().rss;
const { report } = await compileAudioBanks({
  sourceRoot: source,
  soundsJson,
  output: path.join(root, 'banks'),
  rightsConfirmed: true,
});
const individualBytes = (await stat(path.join(sounds, '0.ogg'))).size * 32;
const result = {
  measuredAt: new Date().toISOString(),
  fixture:
    '32 separately named project-generated 440 Hz sine recordings, 120 ms; not game content',
  node: process.version,
  platform: process.platform,
  individual: { assets: 32, encodedBytes: individualBytes },
  banked: report,
  wallMs: performance.now() - started,
  compilerRssChangeBytes: process.memoryUsage().rss - before,
  runtime: {
    status: 'requires permitted uploaded bank IDs and device/WAN testing',
    pending: [
      'bank load latency',
      'time to first playback',
      'seek latency after Roblox transcode',
      'audible boundary leakage',
      'subjective audio quality',
      'multiplayer load',
      'runtime memory comparison',
      'frame-time comparison',
    ],
  },
};
await writeFile(
  path.join(root, 'comparison.json'),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
// Keep the exact exported report available for a reproducible local rerun.
await readFile(path.join(root, 'banks/manifest.json'), 'utf8');
