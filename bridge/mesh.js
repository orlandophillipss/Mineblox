// Cube-only prototype. The material resolver supplies a face merge key and
// occlusion rule. Non-cube models must use another geometry path.
export function greedyMesh(
  region,
  material = (state) =>
    state === 0 ? null : { key: String(state), opaque: true },
  neighbor = () => 0,
) {
  const [sx, sy, sz] = region.size;
  const dims = [sx, sy, sz];
  const read = (p) =>
    p.every((n, i) => n >= 0 && n < dims[i])
      ? region.get(...p)
      : neighbor(p.map((n, i) => n + region.origin[i]));
  const quads = [];
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (const sign of [-1, 1])
      for (let slice = 0; slice < dims[axis]; slice++) {
        const mask = new Array(dims[u] * dims[v]).fill(null);
        for (let j = 0; j < dims[v]; j++)
          for (let i = 0; i < dims[u]; i++) {
            const p = [0, 0, 0];
            p[axis] = slice;
            p[u] = i;
            p[v] = j;
            const a = material(read(p), axis, sign);
            if (!a) continue;
            const q = [...p];
            q[axis] += sign;
            const b = material(read(q), axis, -sign);
            if (b && (b.opaque || (!a.opaque && b.key === a.key))) continue;
            mask[i + dims[u] * j] = a.key;
          }
        for (let j = 0; j < dims[v]; j++)
          for (let i = 0; i < dims[u]; ) {
            const key = mask[i + dims[u] * j];
            if (key === null) {
              i++;
              continue;
            }
            let width = 1;
            while (i + width < dims[u] && mask[i + width + dims[u] * j] === key)
              width++;
            let height = 1;
            outer: while (j + height < dims[v]) {
              for (let k = 0; k < width; k++)
                if (mask[i + k + dims[u] * (j + height)] !== key) break outer;
              height++;
            }
            const origin = [...region.origin];
            origin[axis] += slice + (sign === 1 ? 1 : 0);
            origin[u] += i;
            origin[v] += j;
            quads.push({ axis, sign, origin, width, height, key });
            for (let dy = 0; dy < height; dy++)
              for (let dx = 0; dx < width; dx++)
                mask[i + dx + dims[u] * (j + dy)] = null;
            i += width;
          }
      }
  }
  return quads;
}
