import { parentPort } from 'node:worker_threads';
import { VoxelRegion } from './voxels.js';
import { greedyMesh } from './mesh.js';

parentPort.on('message', ({ id, origin, data, palette }) => {
  try {
    const region = new VoxelRegion({ origin, size: [8, 8, 8], data });
    const materials = new Map(palette.map((p) => [p.state, p]));
    const quads = greedyMesh(region, (state) => {
      const p = materials.get(state);
      return p?.cube ? { key: String(state), opaque: p.opaque } : null;
    });
    // Non-cube collision shapes remain geometry rather than becoming full cubes.
    for (let y = 0; y < 8; y++)
      for (let z = 0; z < 8; z++)
        for (let x = 0; x < 8; x++) {
          const p = materials.get(region.get(x, y, z));
          if (!p || p.cube) continue;
          for (const shape of p.shapes)
            for (let axis = 0; axis < 3; axis++)
              for (const sign of [-1, 1]) {
                const u = (axis + 1) % 3,
                  v = (axis + 2) % 3;
                const at = [origin[0] + x, origin[1] + y, origin[2] + z].map(
                  (n, i) => n + shape[i],
                );
                at[axis] += sign === 1 ? shape[axis + 3] - shape[axis] : 0;
                quads.push({
                  axis,
                  sign,
                  origin: at,
                  width: shape[u + 3] - shape[u],
                  height: shape[v + 3] - shape[v],
                  key: String(p.state),
                });
              }
        }
    if (quads.length > 4096) throw new Error('Partition exceeds mesh budget');
    parentPort.postMessage({
      id,
      quads: quads.map((q) => [
        q.axis,
        q.sign,
        ...q.origin,
        q.width,
        q.height,
        Number(q.key),
      ]),
    });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
