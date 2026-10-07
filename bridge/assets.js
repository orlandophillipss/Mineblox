import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

export const ASSET_ORIGIN = 'https://assets.mcasset.cloud';
const MAX_BYTES = 2 * 1024 * 1024;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function assetPath(value) {
  if (
    typeof value !== 'string' ||
    !/^assets\/minecraft\/(models|blockstates|textures|font)\/[a-z0-9_/-]+\.(json|png|mcmeta)$/.test(
      value,
    ) ||
    value.includes('//')
  )
    throw new Error('Unsupported asset path');
  return value;
}

// Asset fetching is a build/development tool, never part of the gameplay path.
export class AssetStore {
  constructor({
    version,
    cache = '.local/assets',
    localRoot,
    allowRemote = false,
    fetchImpl = fetch,
  }) {
    if (!/^1\.[0-9]+\.[0-9]+$/.test(version))
      throw new Error(
        'Pin an exact Minecraft asset version; aliases are not accepted',
      );
    this.version = version;
    this.cache = path.resolve(cache, version);
    this.localRoot = localRoot && path.resolve(localRoot);
    this.allowRemote = allowRemote;
    this.fetch = fetchImpl;
  }

  async get(relative) {
    assetPath(relative);
    const file = path.join(this.cache, relative);
    try {
      const meta = JSON.parse(await readFile(`${file}.integrity.json`, 'utf8'));
      const bytes = await readFile(file);
      if (bytes.length > MAX_BYTES || meta.sha256 !== digest(bytes))
        throw new Error('Asset cache integrity mismatch');
      return bytes;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    let bytes;
    let source;
    if (this.localRoot) {
      source = 'user-provided';
      bytes = await readFile(path.join(this.localRoot, relative));
    } else {
      if (!this.allowRemote)
        throw new Error(
          'Asset is not cached; supply --local or explicitly opt in with --remote',
        );
      source = `${ASSET_ORIGIN}/${this.version}/${relative}`;
      const response = await this.fetch(source, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Asset HTTP ${response.status}`);
      const expectedType = relative.endsWith('.png')
        ? 'image/png'
        : 'application/json';
      if (!response.headers.get('content-type')?.startsWith(expectedType))
        throw new Error('Unexpected asset content type');
      if (Number(response.headers.get('content-length')) > MAX_BYTES)
        throw new Error('Asset exceeds size limit');
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > MAX_BYTES) throw new Error('Asset exceeds size limit');
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    }
    if (bytes.length > MAX_BYTES) throw new Error('Asset exceeds size limit');
    if (relative.endsWith('.png')) {
      if (
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        throw new Error('Invalid PNG signature');
    } else JSON.parse(bytes.toString('utf8'));
    await mkdir(path.dirname(file), { recursive: true });
    await atomicWrite(file, bytes);
    await atomicWrite(
      `${file}.integrity.json`,
      JSON.stringify({
        version: this.version,
        path: relative,
        source,
        sha256: digest(bytes),
        bytes: bytes.length,
      }),
    );
    return bytes;
  }

  async json(relative) {
    return JSON.parse((await this.get(relative)).toString('utf8'));
  }

  async model(name, chain = []) {
    if (
      !/^minecraft:[a-z0-9_/-]+$/.test(name) ||
      chain.includes(name) ||
      chain.length >= 32
    )
      throw new Error('Invalid or cyclic model parent');
    const data = await this.json(
      `assets/minecraft/models/${name.slice(10)}.json`,
    );
    const parent = data.parent
      ? await this.model(
          data.parent.includes(':') ? data.parent : `minecraft:${data.parent}`,
          [...chain, name],
        )
      : {};
    return {
      ...parent,
      ...data,
      textures: { ...parent.textures, ...data.textures },
    };
  }
}

export function resolveTexture(textures, name) {
  const seen = new Set();
  while (name?.startsWith('#')) {
    if (seen.has(name) || seen.size >= 32)
      throw new Error('Cyclic texture reference');
    seen.add(name);
    name = textures[name.slice(1)];
  }
  if (typeof name !== 'string' || !/^(minecraft:)?[a-z0-9_/-]+$/.test(name))
    throw new Error('Invalid texture reference');
  return `assets/minecraft/textures/${name.replace(/^minecraft:/, '')}.png`;
}

async function atomicWrite(file, bytes) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, file);
}
