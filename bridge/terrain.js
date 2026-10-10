import { Worker } from 'node:worker_threads';
import { BridgeError } from './input.js';
import { stateFaces } from './models.js';
import { encodeVoxels } from './voxel-wire.js';

const colors = {
  grass_block: [95, 149, 55],
  dirt: [129, 91, 58],
  stone: [125, 125, 125],
  bedrock: [61, 61, 61],
  water: [46, 90, 200],
  sand: [218, 207, 148],
  snow: [238, 245, 250],
};
export function partitionKey(position) {
  return [position.x, position.y, position.z]
    .map((n) => Math.floor(n / 8))
    .join(',');
}
export function interestKeys(
  position,
  { radius = 2, velocity, surfaceHeights, minY } = {},
) {
  if (!Number.isInteger(radius) || radius < 2 || radius > 4)
    throw new Error('Invalid terrain radius');
  const [x, y, z] = partitionKey(position).split(',').map(Number);
  const keys = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++)
        keys.push({
          key: `${x + dx},${y + dy},${z + dz}`,
          distance:
            dx * dx +
            dz * dz +
            dy * dy -
            (Math.abs(dx) + Math.abs(dz) > 1
              ? Math.max(
                  -1.5,
                  Math.min(
                    1.5,
                    (dx * (velocity?.x ?? 0) + dz * (velocity?.z ?? 0)) * 4,
                  ),
                )
              : 0),
        });
  const present = new Set(keys.map((p) => p.key));
  for (let dz = -radius; dz <= radius; dz++)
    for (let dx = -radius; dx <= radius; dx++) {
      const height = surfaceHeights?.get(`${x + dx},${z + dz}`);
      if (!Number.isInteger(height) || height + 16 > y * 8 - 8) continue;
      const surfaceY = Math.floor(height / 8);
      for (const sy of [surfaceY - 1, surfaceY, surfaceY + 1]) {
        if (Number.isInteger(minY) && sy * 8 < minY) continue;
        const key = `${x + dx},${sy},${z + dz}`;
        if (present.has(key)) continue;
        present.add(key);
        keys.push({
          key,
          distance: dx * dx + dz * dz + 4 + Math.min(8, Math.abs(sy - y)),
        });
      }
    }
  return keys.sort((a, b) => a.distance - b.distance).map((p) => p.key);
}
export function surfaceHeights(world, position, radius) {
  const heights = new Map(),
    columns = new Map();
  const x = Math.floor(position.x / 8),
    z = Math.floor(position.z / 8);
  if (!world?.getColumn) return heights;
  for (let dz = -radius; dz <= radius; dz++)
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = Math.floor((x + dx) / 2),
        cz = Math.floor((z + dz) / 2),
        key = `${cx},${cz}`;
      if (!columns.has(key)) {
        const column = world.getColumn(cx, cz);
        let height = null;
        // The pinned Prismarine 1.21.4 sections store packet non-air counts. No
        // voxel scan, generated height estimate, or camera request is involved.
        if (
          Number.isInteger(column?.minY) &&
          Array.isArray(column.sections) &&
          column.sections.length <= 64
        ) {
          for (let i = column.sections.length - 1; i >= 0; i--)
            if (column.sections[i]?.solidBlockCount > 0) {
              height = column.minY + i * 16;
              break;
            }
        }
        columns.set(key, height);
      }
      const height = columns.get(key);
      if (height !== null) heights.set(`${x + dx},${z + dz}`, height);
    }
  return heights;
}

// One bounded worker queue prevents mesh work from blocking gameplay exchanges.
export class TerrainService {
  constructor({ models = {}, radius = 2 } = {}) {
    if (!Number.isInteger(radius) || radius < 2 || radius > 4)
      throw new Error('Invalid terrain radius');
    this.models = models;
    this.radius = radius;
    this.maxPartitions = 6 * (radius * 2 + 1) ** 2;
    this.worker = null;
    this.pending = new Map();
    this.serial = 0;
    this.players = new Map();
    this.closed = false;
    this.compact = new WeakMap();
  }
  mesh(payload) {
    if (this.closed) return Promise.reject(new Error('Terrain service closed'));
    if (this.pending.size >= 16)
      throw new BridgeError('Terrain worker is busy', 503);
    if (!this.worker) {
      this.worker = new Worker(new URL('./terrain-worker.js', import.meta.url));
      this.worker.on('message', ({ id, quads, error }) => {
        const request = this.pending.get(id);
        this.pending.delete(id);
        if (error) request?.reject(new Error(error));
        else request?.resolve(quads);
      });
      this.worker.on('error', (error) => {
        for (const p of this.pending.values()) p.reject(error);
        this.pending.clear();
      });
    }
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...payload });
    });
  }
  state(player) {
    let state = this.players.get(player.id);
    if (!state) {
      state = {
        epoch: player.worldEpoch,
        revision: 0,
        cache: new Map(),
        building: new Map(),
        dirty: new Map(),
      };
      this.players.set(player.id, state);
      const invalidate = (oldBlock, block) => {
        const p = block?.position ?? oldBlock?.position;
        if (!p) return;
        const keys = new Set();
        for (const dx of [-1, 0, 1])
          for (const dy of [-1, 0, 1])
            for (const dz of [-1, 0, 1])
              keys.add(partitionKey({ x: p.x + dx, y: p.y + dy, z: p.z + dz }));
        for (const key of keys) {
          state.cache.delete(key);
          state.dirty.set(key, (state.dirty.get(key) ?? 0) + 1);
        }
        state.revision++;
      };
      const reset = (point) => {
        if (point && Number.isFinite(point.x) && Number.isFinite(point.z)) {
          for (const key of new Set([
            ...state.cache.keys(),
            ...state.building.keys(),
          ])) {
            const [x, , z] = key.split(',').map((n) => Number(n) * 8);
            if (
              x >= point.x - 8 &&
              x < point.x + 24 &&
              z >= point.z - 8 &&
              z < point.z + 24
            ) {
              state.cache.delete(key);
              state.dirty.set(key, (state.dirty.get(key) ?? 0) + 1);
            }
          }
        } else {
          for (const key of new Set([
            ...state.cache.keys(),
            ...state.building.keys(),
          ]))
            state.dirty.set(key, (state.dirty.get(key) ?? 0) + 1);
          state.cache.clear();
        }
        state.revision++;
      };
      player.bot.on('blockUpdate', invalidate);
      player.bot.on('chunkColumnLoad', reset);
      player.bot.on('chunkColumnUnload', reset);
      player.once('closed', () => {
        this.players.delete(player.id);
        player.bot.off('blockUpdate', invalidate);
        player.bot.off('chunkColumnLoad', reset);
        player.bot.off('chunkColumnUnload', reset);
      });
    }
    if (state.epoch !== player.worldEpoch) {
      state.epoch = player.worldEpoch;
      state.cache.clear();
      state.dirty.clear();
      state.revision++;
    }
    return state;
  }
  async partition(player, state, key) {
    if (state.cache.has(key)) return state.cache.get(key);
    if (state.building.has(key)) return state.building.get(key);
    const revision = state.revision,
      dirty = state.dirty.get(key) ?? 0,
      epoch = state.epoch;
    const job = (async () => {
      const origin = key.split(',').map((n) => Number(n) * 8);
      const data = new Uint32Array(512),
        palette = new Map();
      const neighbors = {};
      const p = player.bot.entity.position.clone();
      for (let y = 0; y < 8; y++)
        for (let z = 0; z < 8; z++)
          for (let x = 0; x < 8; x++) {
            const block = player.bot.blockAt(
              p.set(origin[0] + x, origin[1] + y, origin[2] + z),
            );
            if (!block) return null; // Retry only when the Minecraft chunk has arrived.
            data[x + 8 * (z + 8 * y)] = block.stateId;
            if (palette.has(block.stateId)) continue;
            const shapes = block.shapes ?? [];
            const cube =
              shapes.length === 1 &&
              shapes[0].every((n, i) => n === (i < 3 ? 0 : 1));
            palette.set(block.stateId, {
              state: block.stateId,
              name: block.name,
              properties: block.getProperties?.() ?? {},
              cube,
              opaque: !block.transparent,
              shapes,
              modelFaces: !cube
                ? stateFaces(
                    this.models,
                    block.name,
                    block.getProperties?.() ?? {},
                  )
                : null,
              color:
                colors[block.name] ??
                (/leaves/.test(block.name)
                  ? [68, 119, 45]
                  : /wood|log|planks/.test(block.name)
                    ? [148, 112, 67]
                    : [155, 155, 155]),
            });
          }
      // A complete one-voxel halo includes diagonals for shared fluid corners.
      for (let axis = 0; axis < 3; axis++)
        for (const side of [-1, 8])
          for (let a = -1; a <= 8; a++)
            for (let b = -1; b <= 8; b++) {
              const at = [...origin];
              at[axis] += side;
              at[(axis + 1) % 3] += a;
              at[(axis + 2) % 3] += b;
              if (neighbors[at.join(',')] !== undefined) continue;
              const block = player.bot.blockAt(p.set(...at));
              if (!block) continue;
              const shapes = block.shapes ?? [];
              const cube =
                shapes.length === 1 &&
                shapes[0].every((n, i) => n === (i < 3 ? 0 : 1));
              // Fluid occupancy includes plants and waterlogged models, not just
              // water blocks. Preserve the loaded halo rather than creating
              // artificial walls around aquatic vegetation at partition seams.
              neighbors[at.join(',')] = block.stateId;
              if (!palette.has(block.stateId))
                palette.set(block.stateId, {
                  state: block.stateId,
                  name: block.name,
                  cube,
                  opaque: !block.transparent,
                  shapes,
                  properties: block.getProperties?.() ?? {},
                  color: colors[block.name] ?? [155, 155, 155],
                });
            }
      const materials = [...palette.values()];
      const quads = await this.mesh({
        origin,
        data,
        palette: materials,
        neighbors,
      });
      const result = {
        key,
        revision: revision + 1,
        origin,
        quads,
        meshFormat: 'quad-fluid-corners-v2',
        voxels: Array.from(data),
        palette: materials.map(
          ({ state, name, color, opaque, properties, shapes, modelFaces }) => ({
            state,
            name,
            color,
            opaque,
            properties,
            shapes,
            modelFaces,
          }),
        ),
      };
      if (
        (state.dirty.get(key) ?? 0) !== dirty ||
        state.epoch !== epoch ||
        player.worldEpoch !== epoch
      )
        return null;
      state.cache.set(key, result);
      return result;
    })();
    state.building.set(key, job);
    try {
      return await job;
    } finally {
      state.building.delete(key);
    }
  }
  async stream(
    player,
    {
      known = {},
      epoch,
      format = 'state-u32-xzy-v1',
      meshFormat = 'quad-v1',
    } = {},
  ) {
    if (!['state-u32-xzy-v1', 'state-adaptive-xzy-v2'].includes(format))
      throw new BridgeError('Unsupported terrain format', 426);
    if (!['quad-v1', 'quad-fluid-corners-v2'].includes(meshFormat))
      throw new BridgeError('Unsupported terrain geometry format', 426);
    if (!player.bot.entity || player.status !== 'ready')
      throw new BridgeError('Player is not ready', 409);
    if (
      !known ||
      typeof known !== 'object' ||
      Array.isArray(known) ||
      Object.keys(known).length > this.maxPartitions ||
      Object.entries(known).some(
        ([k, v]) =>
          !/^-?\d{1,9},-?\d{1,9},-?\d{1,9}$/.test(k) ||
          !Number.isSafeInteger(v) ||
          v < 0,
      )
    )
      throw new BridgeError('Invalid terrain revisions');
    const state = this.state(player);
    const active = interestKeys(player.bot.entity.position, {
      radius: this.radius,
      velocity: player.bot.entity.velocity,
      surfaceHeights: surfaceHeights(
        player.bot.world,
        player.bot.entity.position,
        this.radius,
      ),
      minY: player.bot.game?.minY,
    });
    for (const k of state.cache.keys())
      if (!active.includes(k)) state.cache.delete(k);
    for (const k of state.dirty.keys())
      if (!active.includes(k) && !state.building.has(k)) state.dirty.delete(k);
    const partitions = [];
    let bytes = 0;
    for (const key of active) {
      const cached = state.cache.get(key);
      if (cached && epoch === state.epoch && cached.revision === known[key])
        continue;
      let partition = await this.partition(player, state, key);
      if (partition && format === 'state-adaptive-xzy-v2') {
        let compact = this.compact.get(partition);
        if (!compact) {
          const { voxels, ...geometry } = partition;
          compact = { ...geometry, voxelData: encodeVoxels(voxels) };
          this.compact.set(partition, compact);
        }
        partition = compact;
      }
      if (partition && meshFormat === 'quad-v1')
        partition = {
          ...partition,
          meshFormat: undefined,
          quads: partition.quads.map((q) => (q[9] ? q.slice(0, 8) : q)),
        };
      if (partition) {
        const size = Buffer.byteLength(JSON.stringify(partition));
        if (partitions.length && bytes + size > 768 * 1024) break;
        partitions.push(partition);
        bytes += size;
      }
      if (partitions.length === 16) break;
    }
    return {
      id: player.id,
      version: 1,
      voxelFormat: format,
      minecraftVersion: '1.21.4',
      epoch: state.epoch,
      dimension: player.bot.game?.dimension,
      active,
      partitions,
    };
  }
  async close() {
    this.closed = true;
    for (const p of this.pending.values())
      p.reject(new Error('Terrain service closed'));
    this.pending.clear();
    await this.worker?.terminate();
  }
}
