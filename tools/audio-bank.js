import path from 'node:path';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateBankManifest } from './audio-bank-config.js';

const categories = [
  'blocks',
  'players',
  'ambient',
  'weather',
  'hostile',
  'friendly',
  'music',
  'records',
  'voice',
];
export function category(event) {
  if (/^music\./.test(event)) return 'music';
  if (/^music_disc\./.test(event)) return 'records';
  if (/^weather\./.test(event)) return 'weather';
  if (/^ambient\./.test(event)) return 'ambient';
  if (/^block\./.test(event)) return 'blocks';
  if (/^entity\.player\./.test(event)) return 'players';
  return /^entity\.(zombie|skeleton|creeper|spider|enderman|wither|ghast|blaze|slime|phantom|warden)/.test(
    event,
  )
    ? 'hostile'
    : 'friendly';
}
function id(value, namespace = 'minecraft') {
  if (typeof value !== 'string')
    throw new Error('Sound identifier must be text');
  const full = value.includes(':') ? value : `${namespace}:${value}`;
  if (
    !/^[a-z0-9_.-]+:[a-z0-9_/.-]+$/.test(full) ||
    full
      .split(':')[1]
      .split('/')
      .some((s) => s === '..' || s === '.' || !s)
  )
    throw new Error(`Unsafe sound identifier: ${full}`);
  return full;
}
export function resolveEvents(definitions, namespace = 'minecraft') {
  const result = {};
  const names = Object.keys(definitions);
  const byId = new Map(
    names.map((name) => [id(name, namespace), definitions[name]]),
  );
  if (byId.size !== names.length)
    throw new Error('Duplicate canonical sound event');
  if (names.length > 10000) throw new Error('Sound event limit exceeded');
  const expand = (key, trail = []) => {
    if (trail.length >= 16 || trail.includes(key))
      throw new Error(`Cyclic/deep sound event: ${key}`);
    const definition = byId.get(key);
    if (!definition || !Array.isArray(definition.sounds))
      throw new Error(`Missing sound event: ${key}`);
    const variants = [];
    for (const raw of definition.sounds) {
      const s = typeof raw === 'string' ? { name: raw } : raw;
      if (!s || typeof s !== 'object')
        throw new Error(`Invalid sound variant: ${key}`);
      const weight = s.weight ?? 1,
        volume = s.volume ?? 1,
        pitch = s.pitch ?? 1,
        attenuationDistance = s.attenuation_distance ?? 16;
      if (
        !Number.isInteger(weight) ||
        weight < 1 ||
        weight > 10000 ||
        !Number.isFinite(volume) ||
        volume < 0 ||
        volume > 16 ||
        !Number.isFinite(pitch) ||
        pitch <= 0 ||
        pitch > 16 ||
        !Number.isFinite(attenuationDistance) ||
        attenuationDistance <= 0 ||
        attenuationDistance > 256 ||
        !['file', 'event', undefined].includes(s.type)
      )
        throw new Error(`Invalid sound variant: ${key}`);
      const source = id(s.name, key.split(':')[0]);
      if (s.type === 'event') {
        const nested = expand(source, [...trail, key]);
        const total = nested.reduce((n, v) => n + v.weight, 0);
        for (const child of nested)
          variants.push({
            ...child,
            weight: (weight * child.weight) / total,
            volume: volume * child.volume,
            pitch: pitch * child.pitch,
          });
      } else
        variants.push({
          sample: source,
          weight,
          volume,
          pitch,
          stream: s.stream === true,
          preload: s.preload === true,
          attenuationDistance,
        });
      if (variants.length > 4096) throw new Error(`Too many variants: ${key}`);
    }
    return variants;
  };
  for (const name of names) {
    const full = id(name, namespace),
      c = definitions[name].category ?? category(full.split(':')[1]);
    if (!categories.includes(c)) throw new Error(`Unknown category: ${c}`);
    result[full] = {
      category: c,
      variants: expand(full),
      subtitle: definitions[name].subtitle ?? null,
    };
  }
  return result;
}
function run(binary, args) {
  return execFileSync(binary, args, {
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function probe(file) {
  return JSON.parse(
    run(process.env.FFPROBE_PATH ?? 'ffprobe', [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      file,
    ]),
  );
}
export async function compileAudioBanks(options) {
  if (options.rightsConfirmed !== true)
    throw new Error(
      'Confirm rights to the source recordings in the compiler config',
    );
  const rate = options.sampleRate ?? 48000,
    channels = options.channels ?? 1,
    gap = options.paddingSeconds ?? 0.3;
  const maxSeconds = options.maxSeconds ?? 418,
    maxBytes = options.maxBytes ?? 19_900_000;
  if (
    ![24000, 44100, 48000].includes(rate) ||
    ![1, 2].includes(channels) ||
    !Number.isFinite(gap) ||
    gap < 0.15 ||
    gap > 5 ||
    !Number.isFinite(maxSeconds) ||
    maxSeconds < 1 ||
    maxSeconds >= 420 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 10000 ||
    maxBytes >= 20_000_000
  )
    throw new Error('Invalid audio bank limits/format');
  const root = await realpath(options.sourceRoot),
    output = path.resolve(options.output ?? '.local/audio-banks');
  if (output === root || output.startsWith(root + path.sep))
    throw new Error('Bank output must be separate from source recordings');
  await mkdir(output, { recursive: true });
  const work = path.join(output, 'work');
  await mkdir(work, { recursive: true });
  const definitions = JSON.parse(await readFile(options.soundsJson, 'utf8'));
  const events = resolveEvents(definitions, options.namespace),
    sources = new Map();
  for (const [event, d] of Object.entries(events))
    for (const v of d.variants) {
      if (!sources.has(v.sample))
        sources.set(v.sample, { ...v, category: d.category, event });
      else if (v.stream || ['music', 'records'].includes(d.category))
        sources.get(v.sample).stream = true;
    }
  if (sources.size > 10000) throw new Error('Audio sample limit exceeded');
  const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg',
    samples = {},
    banks = {},
    reports = [];
  const gapFrames = Math.ceil(gap * rate),
    stride = channels * 2,
    padding = Buffer.alloc(gapFrames * stride);
  let bankId = 0,
    group = null,
    pieces = [],
    pending = [],
    frames = 0;
  const flush = async () => {
    if (!pending.length) return;
    const bank = ++bankId,
      file = path.join(output, `bank-${String(bank).padStart(3, '0')}.flac`),
      raw = path.join(work, 'bank.pcm');
    const pcm = Buffer.concat(pieces);
    await writeFile(raw, pcm);
    run(ffmpeg, [
      '-v',
      'error',
      '-y',
      '-f',
      's16le',
      '-ar',
      String(rate),
      '-ac',
      String(channels),
      '-i',
      raw,
      '-c:a',
      'flac',
      file,
    ]);
    // FLAC is lossless and has no encoder delay. Decode the actual exported
    // bank and verify every frame; timestamps come from this encoded output.
    const decoded = run(ffmpeg, [
      '-v',
      'error',
      '-i',
      file,
      '-f',
      's16le',
      '-acodec',
      'pcm_s16le',
      '-',
    ]);
    if (!decoded.equals(pcm))
      throw new Error(
        'Encoded bank changed PCM frames; refusing guessed timestamps',
      );
    const info = probe(file),
      bytes = (await stat(file)).size,
      duration = decoded.length / stride / rate;
    if (
      bytes >= maxBytes ||
      duration >= maxSeconds ||
      Number(info.streams[0].sample_rate) !== rate
    )
      throw new Error('Encoded bank exceeds verified import bounds');
    banks[bank] = {
      file: path.basename(file),
      assetId: null,
      category: group,
      duration,
      bytes,
      sha256: createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    };
    for (const s of pending)
      samples[s.name] = {
        bank,
        startFrame: s.start,
        frames: s.frames,
        start: s.start / rate,
        duration: s.frames / rate,
        end: (s.start + s.frames) / rate,
      };
    reports.push({
      bank,
      samples: pending.length,
      bytes,
      duration,
      pcmBytes: pcm.length,
    });
    pieces = [];
    pending = [];
    frames = 0;
  };
  const started = performance.now();
  for (const [name, s] of [...sources].sort(
    (a, b) =>
      a[1].category.localeCompare(b[1].category) || a[0].localeCompare(b[0]),
  )) {
    const [namespace, relative] = name.split(':');
    const requested = path.join(
      root,
      'assets',
      namespace,
      'sounds',
      relative + '.ogg',
    );
    const file = await realpath(requested);
    if (!file.startsWith(root + path.sep))
      throw new Error(`Audio source escapes authorised directory: ${name}`);
    const sourceInfo = probe(file);
    if (Number(sourceInfo.format.duration) >= 420)
      throw new Error(`Recording exceeds seven minutes: ${name}`);
    const pcm = run(ffmpeg, [
      '-v',
      'error',
      '-i',
      file,
      '-ar',
      String(rate),
      '-ac',
      String(channels),
      '-f',
      's16le',
      '-acodec',
      'pcm_s16le',
      '-',
    ]);
    const n = pcm.length / stride;
    if (!Number.isInteger(n) || n === 0)
      throw new Error(`Empty/invalid PCM: ${name}`);
    // Conservative raw size bounds guarantee lossless banks fit even for noise.
    // Long/music/stream tracks stay separate and use ordinary individual audio.
    if (
      n / rate + gap * 2 >= maxSeconds ||
      pcm.length + padding.length * 2 + 8192 >= maxBytes ||
      s.stream ||
      ['music', 'records'].includes(s.category)
    ) {
      await flush();
      const bank = ++bankId,
        exported = path.join(
          output,
          `track-${String(bank).padStart(3, '0')}.ogg`,
        );
      run(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-i',
        file,
        '-ar',
        String(rate),
        '-ac',
        String(channels),
        '-c:a',
        'libvorbis',
        '-q:a',
        '6',
        exported,
      ]);
      const encoded = probe(exported),
        decoded = run(ffmpeg, [
          '-v',
          'error',
          '-i',
          exported,
          '-f',
          's16le',
          '-acodec',
          'pcm_s16le',
          '-',
        ]);
      const duration = decoded.length / stride / rate,
        bytes = (await stat(exported)).size;
      if (
        bytes >= maxBytes ||
        duration >= 420 ||
        Number(encoded.streams[0].sample_rate) !== rate
      )
        throw new Error(`Standalone track exceeds import constraints: ${name}`);
      banks[bank] = {
        file: path.basename(exported),
        assetId: null,
        category: s.category,
        duration,
        bytes,
        standalone: true,
        sha256: createHash('sha256')
          .update(await readFile(exported))
          .digest('hex'),
      };
      samples[name] = {
        bank,
        start: 0,
        startFrame: 0,
        frames: decoded.length / stride,
        duration,
        end: duration,
      };
      continue;
    }
    if (
      group !== s.category ||
      (frames + n + gapFrames) * stride + 8192 >= maxBytes ||
      (frames + n + gapFrames) / rate >= maxSeconds
    )
      await flush();
    group = s.category;
    if (!pending.length) {
      pieces.push(padding);
      frames = gapFrames;
    }
    pending.push({ name, start: frames, frames: n });
    pieces.push(pcm, padding);
    frames += n + gapFrames;
  }
  await flush();
  const manifest = validateBankManifest({
    format: 'mineblox-audio-bank-v1',
    sampleRate: rate,
    channels,
    paddingSeconds: gap,
    banks,
    samples,
    events,
  });
  await writeFile(
    path.join(output, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  if (options.creatorType || options.creatorId) {
    if (
      !['userId', 'groupId'].includes(options.creatorType) ||
      !/^[1-9]\d{0,19}$/.test(options.creatorId)
    )
      throw new Error('Invalid audio import creator');
    const entries = Object.entries(banks);
    for (let i = 0; i < entries.length; i += 32)
      await writeFile(
        path.join(output, `import-${Math.floor(i / 32) + 1}.json`),
        JSON.stringify(
          {
            rightsConfirmed: true,
            creatorType: options.creatorType,
            creatorId: options.creatorId,
            bankManifest: 'manifest.json',
            assets: entries.slice(i, i + 32).map(([key, b]) => ({
              key,
              file: b.file,
              name: `mineblox_${b.category}_bank_${key}`,
              kind: 'bank',
            })),
          },
          null,
          2,
        ),
      );
  }
  const report = {
    samples: sources.size,
    assets: Object.keys(banks).length,
    encodedBytes: Object.values(banks).reduce((n, b) => n + b.bytes, 0),
    compilerMs: performance.now() - started,
    banks: reports,
    verification:
      'exported FLAC decoded and compared byte-for-byte; standalone OGG boundaries measured from decoded output; Roblox transcode/runtime not yet validated',
  };
  await writeFile(
    path.join(output, 'benchmark.json'),
    JSON.stringify(report, null, 2),
  );
  return { manifest, report };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const config = JSON.parse(
    await readFile(process.argv[2] ?? '.local/audio-bank-config.json', 'utf8'),
  );
  console.log((await compileAudioBanks(config)).report);
}
