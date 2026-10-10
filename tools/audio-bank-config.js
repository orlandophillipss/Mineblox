import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
export function validateBankManifest(m) {
  if (
    !m ||
    m.format !== 'mineblox-audio-bank-v1' ||
    !m.banks ||
    !m.samples ||
    !m.events ||
    Object.keys(m.banks).length > 256 ||
    Object.keys(m.samples).length > 10000 ||
    Object.keys(m.events).length > 10000
  )
    throw new Error('Invalid audio-bank manifest');
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
  for (const [id, b] of Object.entries(m.banks))
    if (
      !/^[1-9]\d{0,5}$/.test(id) ||
      !b ||
      !Number.isFinite(b.duration) ||
      b.duration <= 0 ||
      b.duration >= 420 ||
      !categories.includes(b.category) ||
      (b.assetId !== null && !/^rbxassetid:\/\/[1-9]\d{0,19}$/.test(b.assetId))
    )
      throw new Error('Invalid permitted bank asset ID or duration/category');
  for (const s of Object.values(m.samples)) {
    if (!s || typeof s !== 'object') throw new Error('Invalid audio sample');
    const bank = m.banks[s.bank];
    if (
      !bank ||
      ![s.start, s.end, s.duration].every(Number.isFinite) ||
      s.start < 0 ||
      s.end <= s.start ||
      s.end > bank.duration + 0.001 ||
      Math.abs(s.end - s.start - s.duration) > 0.001
    )
      throw new Error('Sample outside audio bank');
  }
  for (const e of Object.values(m.events)) {
    if (
      !e ||
      !categories.includes(e.category) ||
      !Array.isArray(e.variants) ||
      e.variants.length > 4096
    )
      throw new Error('Invalid audio event variants');
    for (const v of e.variants)
      if (
        !v ||
        !m.samples[v.sample] ||
        !Number.isFinite(v.weight) ||
        v.weight <= 0 ||
        !Number.isFinite(v.volume) ||
        v.volume < 0 ||
        v.volume > 256 ||
        !Number.isFinite(v.pitch) ||
        v.pitch <= 0 ||
        v.pitch > 256 ||
        !Number.isFinite(v.attenuationDistance) ||
        v.attenuationDistance <= 0 ||
        v.attenuationDistance > 256
      )
        throw new Error('Invalid bank event mapping');
  }
  return m;
}
export async function writeAudioBankConfig(root) {
  let manifest = {
    format: 'mineblox-audio-bank-v1',
    banks: {},
    samples: {},
    events: {},
  };
  try {
    manifest = validateBankManifest(
      JSON.parse(
        await readFile(
          process.env.MINEBLOX_AUDIO_BANK_MANIFEST ??
            '.local/audio-banks/manifest.json',
          'utf8',
        ),
      ),
    );
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const packs = path.join(root, 'AudioBankData');
  await mkdir(packs, { recursive: true });
  const chunks = [];
  let chunk = {};
  for (const field of ['banks', 'samples', 'events'])
    for (const [key, value] of Object.entries(manifest[field])) {
      const slim =
        field === 'banks'
          ? {
              assetId: value.assetId,
              duration: value.duration,
              category: value.category,
            }
          : value;
      const item = { field, key, value: slim };
      if (JSON.stringify(item).length > 70000)
        throw new Error('Audio event exceeds ModuleScript pack budget');
      if (JSON.stringify(chunk).length + JSON.stringify(item).length > 70000) {
        chunks.push(chunk);
        chunk = {};
      }
      (chunk[field] ??= {})[key] = slim;
    }
  chunks.push(chunk);
  for (let i = 0; i < chunks.length; i++)
    await writeFile(
      path.join(packs, `Pack${i + 1}.luau`),
      `return game:GetService("HttpService"):JSONDecode(${JSON.stringify(JSON.stringify(chunks[i]))})\n`,
    );
  await writeFile(
    path.join(root, 'AudioBankConfig.luau'),
    `local result={format="mineblox-audio-bank-v1",banks={},samples={},events={}}\nfor i=1,${chunks.length} do local pack=require(script.Parent.AudioBankData["Pack"..i]) for field,values in pairs(pack) do for key,value in pairs(values) do result[field][key]=value end end end\nreturn result\n`,
  );
}
