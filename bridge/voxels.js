export const MAX_VOXELS = 64 ** 3;

export class VoxelRegion {
  constructor({ origin = [0, 0, 0], size, revision = 0, data }) {
    if (
      !Array.isArray(size) ||
      size.length !== 3 ||
      size.some((n) => !Number.isInteger(n) || n < 1 || n > 64) ||
      size.reduce((a, b) => a * b, 1) > MAX_VOXELS
    )
      throw new Error('Invalid voxel dimensions');
    if (
      !Array.isArray(origin) ||
      origin.length !== 3 ||
      origin.some(
        (n) => !Number.isInteger(n) || n < -0x80000000 || n > 0x7fffffff,
      )
    )
      throw new Error('Invalid voxel origin');
    if (!Number.isInteger(revision) || revision < 0 || revision > 0xffffffff)
      throw new Error('Invalid revision');
    this.origin = [...origin];
    this.size = [...size];
    this.revision = revision;
    this.data = data
      ? new Uint32Array(data)
      : new Uint32Array(size[0] * size[1] * size[2]);
    if (this.data.length !== size[0] * size[1] * size[2])
      throw new Error('Voxel count mismatch');
  }

  index(x, y, z) {
    if (
      ![x, y, z].every(Number.isInteger) ||
      x < 0 ||
      y < 0 ||
      z < 0 ||
      x >= this.size[0] ||
      y >= this.size[1] ||
      z >= this.size[2]
    )
      throw new Error('Voxel outside region');
    return x + this.size[0] * (z + this.size[2] * y);
  }

  get(x, y, z) {
    return this.data[this.index(x, y, z)];
  }
  set(x, y, z, state) {
    if (!Number.isInteger(state) || state < 0 || state > 0xffffffff)
      throw new Error('Invalid block state');
    this.data[this.index(x, y, z)] = state;
  }

  applyDelta({ base, revision, changes }) {
    if (
      !Number.isInteger(base) ||
      !Number.isInteger(revision) ||
      base < 0 ||
      base >= 0xffffffff ||
      revision !== base + 1 ||
      revision > 0xffffffff ||
      !Array.isArray(changes) ||
      changes.length > this.data.length
    )
      throw new Error('Invalid delta');
    if (revision <= this.revision) return 'stale';
    if (base !== this.revision) return 'resync';
    const validated = changes.map(({ x, y, z, state }) => {
      if (!Number.isInteger(state) || state < 0 || state > 0xffffffff)
        throw new Error('Invalid block state');
      return [this.index(x, y, z), state];
    });
    // Validate the whole delta before mutating anything.
    for (const [index, state] of validated) this.data[index] = state;
    this.revision = revision;
    return 'applied';
  }
}

export function encodeSnapshot(region) {
  const buffer = Buffer.allocUnsafe(32 + region.data.length * 4);
  buffer.write('MBVX', 0, 'ascii');
  buffer.writeUInt16LE(1, 4);
  buffer.writeUInt16LE(1, 6);
  for (let i = 0; i < 3; i++) buffer.writeInt32LE(region.origin[i], 8 + i * 4);
  buffer.writeUInt32LE(region.revision, 20);
  for (let i = 0; i < 3; i++) buffer.writeUInt16LE(region.size[i], 24 + i * 2);
  buffer.writeUInt16LE(0, 30);
  region.data.forEach((state, i) => buffer.writeUInt32LE(state, 32 + i * 4));
  return buffer;
}

export function decodeSnapshot(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 32 ||
    buffer.length > 32 + MAX_VOXELS * 4
  )
    throw new Error('Invalid snapshot length');
  if (
    buffer.toString('ascii', 0, 4) !== 'MBVX' ||
    buffer.readUInt16LE(4) !== 1 ||
    buffer.readUInt16LE(6) !== 1 ||
    buffer.readUInt16LE(30) !== 0
  )
    throw new Error('Unsupported snapshot header');
  const size = [0, 1, 2].map((i) => buffer.readUInt16LE(24 + i * 2));
  const count = size.reduce((a, b) => a * b, 1);
  if (
    size.some((n) => n < 1 || n > 64) ||
    count > MAX_VOXELS ||
    buffer.length !== 32 + count * 4
  )
    throw new Error('Invalid snapshot dimensions or length');
  const data = new Uint32Array(count);
  for (let i = 0; i < count; i++) data[i] = buffer.readUInt32LE(32 + i * 4);
  return new VoxelRegion({
    size,
    origin: [0, 1, 2].map((i) => buffer.readInt32LE(8 + i * 4)),
    revision: buffer.readUInt32LE(20),
    data,
  });
}

// Extract only a bounded, fully loaded region from the adapter's decoded world.
// State IDs are version-local; dimensions and version accompany the region.
export function extractRegion(bot, origin, size) {
  const region = new VoxelRegion({ origin, size });
  for (let y = 0; y < size[1]; y++)
    for (let z = 0; z < size[2]; z++)
      for (let x = 0; x < size[0]; x++) {
        const block = bot.blockAt(
          bot.entity.position
            .clone()
            .set(origin[0] + x, origin[1] + y, origin[2] + z),
        );
        if (!block)
          throw new Error(
            'Region is not fully loaded; retry after chunk streaming',
          );
        region.set(x, y, z, block.stateId);
      }
  return region;
}
