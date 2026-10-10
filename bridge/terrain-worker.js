import { parentPort } from 'node:worker_threads';
import { VoxelRegion } from './voxels.js';
import { greedyMesh } from './mesh.js';
import { fluidHeight, fluidKind, fluidCorners } from './fluid.js';

parentPort.on('message', ({ id, origin, data, palette, neighbors = {} }) => {
  try {
    const region = new VoxelRegion({ origin, size: [8, 8, 8], data });
    const materials = new Map(palette.map((p) => [p.state, p]));
    const at = (x, y, z) =>
      materials.get(
        x >= 0 && x < 8 && y >= 0 && y < 8 && z >= 0 && z < 8
          ? region.get(x, y, z)
          : neighbors[[origin[0] + x, origin[1] + y, origin[2] + z].join(',')],
      );
    const quads = greedyMesh(
      region,
      (state) => {
        const p = materials.get(state);
        return p?.cube
          ? {
              key: String(state),
              opaque: p.opaque,
              // State-local distance/persistence do not change the leaf surface.
              // Keep merge keys distinct, but omit coincident interior foliage.
              cullKey: p.name.endsWith('_leaves') ? p.name : String(state),
            }
          : null;
      },
      (point) => neighbors[point.join(',')] ?? 0,
    );
    // Non-cube collision shapes remain geometry rather than becoming full cubes.
    for (let y = 0; y < 8; y++)
      for (let z = 0; z < 8; z++)
        for (let x = 0; x < 8; x++) {
          const p = materials.get(region.get(x, y, z));
          if (!p || p.cube) continue;
          if (p.modelFaces?.length) {
            for (let index = 0; index < p.modelFaces.length; index++) {
              const direction = {
                west: [-1, 0, 0],
                east: [1, 0, 0],
                down: [0, -1, 0],
                up: [0, 1, 0],
                north: [0, 0, -1],
                south: [0, 0, 1],
              }[p.modelFaces[index].cullface];
              if (direction) {
                const neighbor = at(
                  x + direction[0],
                  y + direction[1],
                  z + direction[2],
                );
                if (neighbor?.cube && neighbor.opaque) continue;
              }
              quads.push({
                axis: 0,
                sign: 1,
                origin: [origin[0] + x, origin[1] + y, origin[2] + z],
                width: 0,
                height: 0,
                key: String(p.state),
                faceIndex: index + 1,
              });
            }
            continue;
          }
          const shapes = ['water', 'lava'].includes(p.name)
            ? [
                [
                  0,
                  0,
                  0,
                  1,
                  fluidHeight(
                    p.properties.level,
                    fluidKind(at(x, y + 1, z)) === p.name,
                  ),
                  1,
                ],
              ]
            : p.shapes;
          const corners = ['water', 'lava'].includes(p.name)
            ? fluidCorners(at, x, y, z, p.name)
            : null;
          for (const shape of shapes)
            for (let axis = 0; axis < 3; axis++)
              for (const sign of [-1, 1]) {
                if (['water', 'lava'].includes(p.name)) {
                  const neighbor = [x, y, z];
                  neighbor[axis] += sign;
                  const n = at(...neighbor);
                  if (fluidKind(n) === p.name || (n?.cube && n?.opaque))
                    continue;
                }
                const u = (axis + 1) % 3,
                  v = (axis + 2) % 3;
                const faceOrigin = [
                  origin[0] + x,
                  origin[1] + y,
                  origin[2] + z,
                ].map((n, i) => n + shape[i]);
                faceOrigin[axis] +=
                  sign === 1 ? shape[axis + 3] - shape[axis] : 0;
                quads.push({
                  axis,
                  sign,
                  origin: faceOrigin,
                  width: shape[u + 3] - shape[u],
                  height: shape[v + 3] - shape[v],
                  key: String(p.state),
                  ...(corners && !(axis === 1 && sign === -1)
                    ? {
                        fluid: [
                          origin[0] + x,
                          origin[1] + y,
                          origin[2] + z,
                          ...corners,
                        ],
                      }
                    : {}),
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
        ...(q.faceIndex ? [q.faceIndex] : q.fluid ? [0, q.fluid] : []),
      ]),
    });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
