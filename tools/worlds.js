import {
  mkdir,
  readFile,
  writeFile,
  rename,
  lstat,
  realpath,
  cp,
  readdir,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hostLockStatus } from './host-lock.js';

export function worldSpec(id, options = {}) {
  if (
    typeof id !== 'string' ||
    !/^[a-z][a-z0-9-]{0,39}$/.test(id) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(id)
  )
    throw new Error(
      'World ID must be 1–40 lowercase letters, numbers or hyphens, beginning with a letter',
    );
  const spec = {
    id,
    name: options.name ?? id,
    seed: String(options.seed ?? ''),
    generator: options.generator ?? 'normal',
    mode: options.mode ?? 'survival',
    difficulty: options.difficulty ?? 'normal',
  };
  if (
    typeof spec.name !== 'string' ||
    spec.name.length < 1 ||
    spec.name.length > 80 ||
    [...spec.name].some((c) => c.charCodeAt(0) < 32)
  )
    throw new Error('Invalid world name');
  if (spec.seed.length > 64 || [...spec.seed].some((c) => c.charCodeAt(0) < 32))
    throw new Error('Invalid world seed');
  if (
    !['normal', 'flat', 'large_biomes', 'amplified'].includes(spec.generator) ||
    !['survival', 'creative', 'adventure', 'spectator'].includes(spec.mode) ||
    !['peaceful', 'easy', 'normal', 'hard'].includes(spec.difficulty)
  )
    throw new Error('Unsupported world generation/game mode/difficulty');
  return spec;
}
async function atomic(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temporary, file);
}
export class WorldStore {
  constructor(workspace = process.cwd()) {
    this.root = path.resolve(workspace, '.local');
    this.file = path.join(this.root, 'worlds.json');
  }
  async registry() {
    try {
      const value = JSON.parse(await readFile(this.file, 'utf8'));
      if (
        value.version !== 1 ||
        !Array.isArray(value.worlds) ||
        value.worlds.length > 100
      )
        throw new Error('Invalid world registry');
      for (const w of value.worlds) worldSpec(w.id, w);
      if (!value.worlds.some((w) => w.id === value.active))
        throw new Error('Active world is missing');
      return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return {
        version: 1,
        active: 'default',
        worlds: [
          {
            ...worldSpec('default', {
              name: 'Existing Mineblox world',
              seed: '12345',
            }),
            legacy: true,
          },
        ],
      };
    }
  }
  async save(registry) {
    await mkdir(this.root, { recursive: true });
    await atomic(this.file, registry);
  }
  async directory(world) {
    const target =
      world.legacy === true && world.id === 'default'
        ? path.join(this.root, 'minecraft')
        : path.join(this.root, 'worlds', worldSpec(world.id).id);
    // Never traverse symlinks/junctions for world writes, copies or renames.
    for (
      let current = target;
      current !== path.dirname(this.root);
      current = path.dirname(current)
    ) {
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw new Error('World paths must not contain links or junctions');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (current === this.root) break;
    }
    return target;
  }
  async active() {
    const r = await this.registry();
    const spec = r.worlds.find((w) => w.id === r.active);
    return { ...spec, directory: await this.directory(spec) };
  }
  async assertStopped() {
    if (await hostLockStatus(path.dirname(this.root)))
      throw new Error(
        'Stop the running host before changing or backing up worlds',
      );
  }
  async create(id, options = {}) {
    await this.assertStopped();
    const spec = worldSpec(id, options);
    const r = await this.registry();
    if (r.worlds.length >= 100 || r.worlds.some((w) => w.id === id))
      throw new Error('World already exists or world limit reached');
    const directory = await this.directory(spec);
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
    r.worlds.push({ ...spec, createdAt: new Date().toISOString() });
    await this.save(r);
    return spec;
  }
  async select(id) {
    await this.assertStopped();
    const r = await this.registry();
    if (!r.worlds.some((w) => w.id === id)) throw new Error('Unknown world');
    r.active = id;
    await this.save(r);
    return this.active();
  }
  async rename(id, name) {
    await this.assertStopped();
    const r = await this.registry();
    const w = r.worlds.find((w) => w.id === id);
    if (!w) throw new Error('Unknown world');
    w.name = worldSpec(id, { ...w, name }).name;
    await this.save(r);
  }
  async backup(id) {
    await this.assertStopped();
    const r = await this.registry();
    const w = r.worlds.find((w) => w.id === id);
    if (!w) throw new Error('Unknown world');
    const source = await this.directory(w);
    const backupRoot = path.join(this.root, 'backups');
    await mkdir(backupRoot, { recursive: true });
    if ((await lstat(backupRoot)).isSymbolicLink())
      throw new Error('Backup directory must not be a link');
    const destination = path.join(
      backupRoot,
      `${id}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    );
    const base = await realpath(source);
    await cp(source, destination, {
      recursive: true,
      filter: async (file) => {
        if ((await lstat(file)).isSymbolicLink())
          throw new Error('World backups reject links');
        const resolved = await realpath(file);
        if (resolved !== base && !resolved.startsWith(base + path.sep))
          throw new Error('World backup escaped its directory');
        return !['server.jar', 'libraries', 'versions'].includes(
          path.basename(file),
        );
      },
    });
    await writeFile(
      path.join(destination, 'mineblox-world.json'),
      JSON.stringify(w, null, 2),
    );
    return destination;
  }
  async backups() {
    try {
      return await readdir(path.join(this.root, 'backups'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  async restore(backup, id) {
    await this.assertStopped();
    worldSpec(id);
    if (
      typeof backup !== 'string' ||
      !/^[a-z][a-z0-9-]{0,39}-\d{13}-[a-f0-9-]{8}$/.test(backup)
    )
      throw new Error('Invalid backup identifier');
    const source = path.join(this.root, 'backups', backup);
    if (
      (await lstat(source)).isSymbolicLink() ||
      (await lstat(path.dirname(source))).isSymbolicLink()
    )
      throw new Error('Restore rejects linked backups');
    const saved = JSON.parse(
      await readFile(path.join(source, 'mineblox-world.json'), 'utf8'),
    );
    worldSpec(saved.id, saved);
    await this.create(id, { ...saved, name: `${saved.name} (restored)` });
    const destination = await this.directory(worldSpec(id));
    await cp(source, destination, {
      recursive: true,
      filter: async (file) => {
        if ((await lstat(file)).isSymbolicLink())
          throw new Error('Restore rejects links');
        return path.basename(file) !== 'mineblox-world.json';
      },
    });
    if (saved.legacy)
      await rename(
        path.join(destination, 'mineblox-overworld'),
        path.join(destination, 'world'),
      );
    return destination;
  }
  async archive(id) {
    await this.assertStopped();
    const r = await this.registry();
    const w = r.worlds.find((w) => w.id === id);
    if (!w || id === r.active || w.legacy)
      throw new Error(
        'Select another world before archiving; the original world cannot be archived',
      );
    const source = await this.directory(w);
    const archives = path.join(this.root, 'archived-worlds');
    await mkdir(archives, { recursive: true });
    if ((await lstat(archives)).isSymbolicLink())
      throw new Error('Archive directory must not be a link');
    const destination = path.join(archives, `${id}-${Date.now()}`);
    await rename(source, destination);
    r.worlds = r.worlds.filter((entry) => entry.id !== id);
    await this.save(r);
    return destination;
  }
}
export function serverProperties(world) {
  worldSpec(world.id, world);
  return (
    [
      'server-ip=127.0.0.1',
      'server-port=25565',
      'online-mode=false',
      'enforce-secure-profile=false',
      `level-name=${world.legacy ? 'mineblox-overworld' : 'world'}`,
      `level-type=minecraft:${world.generator}`,
      `level-seed=${world.seed.replaceAll('\\', '\\\\').replaceAll('=', '\\=').replaceAll(':', '\\:')}`,
      'generate-structures=true',
      ...(world.generator === 'flat'
        ? [
            'generator-settings=' +
              JSON.stringify({
                features: false,
                biome: 'minecraft:plains',
                layers: [
                  { block: 'minecraft:bedrock', height: 1 },
                  { block: 'minecraft:dirt', height: 2 },
                  { block: 'minecraft:grass_block', height: 1 },
                ],
                structure_overrides: [
                  'minecraft:strongholds',
                  'minecraft:villages',
                ],
                lakes: false,
              }),
          ]
        : []),
      'spawn-protection=0',
      `gamemode=${world.mode}`,
      `difficulty=${world.difficulty}`,
      'view-distance=3',
      'simulation-distance=3',
      'max-players=20',
      'enable-rcon=false',
      'enable-query=false',
    ].join('\n') + '\n'
  );
}
