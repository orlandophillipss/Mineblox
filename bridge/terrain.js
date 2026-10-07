import { Worker } from 'node:worker_threads';
import { BridgeError } from './input.js';
import { stateFaces } from './models.js';

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
export function interestKeys(position, { radius = 2, velocity } = {}) {
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
  return keys.sort((a, b) => a.distance - b.distance).map((p) => p.key);
}

// One bounded worker queue prevents mesh work from blocking gameplay exchanges.
export class TerrainService {
  constructor({ models = {}, radius = 2 } = {}) {
    this.models = models;
    this.radius = radius;
    this.maxPartitions = 3 * (radius * 2 + 1) ** 2;
    this.worker = null;
    this.pending = new Map();
    this.serial = 0;
    this.players = new Map();
    this.closed = false;
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
      };
      this.players.set(player.id, state);
      const invalidate = (oldBlock, block) => {
        const p = block?.position ?? oldBlock?.position;
        if (!p) return;
        for (const [dx, dy, dz] of [
          [0, 0, 0],
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ])
          state.cache.delete(
            partitionKey({ x: p.x + dx, y: p.y + dy, z: p.z + dz }),
          );
        state.revision++;
      };
      const reset = (point) => {
        if (point && Number.isFinite(point.x) && Number.isFinite(point.z)) {
          for (const key of state.cache.keys()) {
            const [x, , z] = key.split(',').map((n) => Number(n) * 8);
            if (
              x >= point.x - 8 &&
              x < point.x + 24 &&
              z >= point.z - 8 &&
              z < point.z + 24
            )
              state.cache.delete(key);
          }
        } else state.cache.clear();
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
      state.revision++;
    }
    return state;
  }
  async partition(player, state, key) {
    if (state.cache.has(key)) return state.cache.get(key);
    if (state.building.has(key)) return state.building.get(key);
    const revision = state.revision,
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
      // A one-face-thick halo removes duplicate internal partition faces.
      for (let axis = 0; axis < 3; axis++)
        for (const side of [-1, 8])
          for (let a = 0; a < 8; a++)
            for (let b = 0; b < 8; b++) {
              const at = [...origin];
              at[axis] += side;
              at[(axis + 1) % 3] += a;
              at[(axis + 2) % 3] += b;
              const block = player.bot.blockAt(p.set(...at));
              if (!block) continue;
              const shapes = block.shapes ?? [];
              const cube =
                shapes.length === 1 &&
                shapes[0].every((n, i) => n === (i < 3 ? 0 : 1));
              if (
                (cube && !block.transparent) ||
                ['water', 'lava'].includes(block.name)
              )
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
        state.revision !== revision ||
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
  async stream(player, { known = {}, epoch } = {}) {
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
    });
    for (const k of state.cache.keys())
      if (!active.includes(k)) state.cache.delete(k);
    const partitions = [];
    for (const key of active) {
      const cached = state.cache.get(key);
      if (cached && epoch === state.epoch && cached.revision === known[key])
        continue;
      const partition = await this.partition(player, state, key);
      if (partition) partitions.push(partition);
      if (partitions.length === 4) break;
    }
    return {
      id: player.id,
      version: 1,
      voxelFormat: 'state-u32-xzy-v1',
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
