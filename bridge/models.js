import { resolveTexture } from './assets.js';
const directions = {
  west: [0, -1],
  east: [0, 1],
  down: [1, -1],
  up: [1, 1],
  north: [2, -1],
  south: [2, 1],
};
export function matches(condition, properties) {
  if (!condition) return true;
  if (condition.OR) return condition.OR.some((c) => matches(c, properties));
  if (condition.AND) return condition.AND.every((c) => matches(c, properties));
  return Object.entries(condition).every(([key, value]) =>
    String(value).split('|').includes(String(properties[key])),
  );
}
export function selectModels(blockstate, properties) {
  const selected = [];
  for (const [key, value] of Object.entries(blockstate.variants ?? {})) {
    const condition = Object.fromEntries(
      key
        .split(',')
        .filter(Boolean)
        .map((p) => p.split('=')),
    );
    if (matches(condition, properties))
      selected.push(Array.isArray(value) ? value[0] : value);
  }
  for (const part of blockstate.multipart ?? [])
    if (matches(part.when, properties))
      selected.push(Array.isArray(part.apply) ? part.apply[0] : part.apply);
  return selected.slice(0, 16);
}
function rotate(p, axis, angle, center = [0.5, 0.5, 0.5]) {
  const a = (angle * Math.PI) / 180,
    cos = Math.cos(a),
    sin = Math.sin(a),
    out = p.map((n, i) => n - center[i]);
  const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1];
  [out[u], out[v]] = [out[u] * cos - out[v] * sin, out[u] * sin + out[v] * cos];
  return out.map((n, i) => n + center[i]);
}
// Texture axes belong to the original face, before element/block rotation.
// Inferred rectangles use its dimensions instead of stretching every slab face
// across the complete texture. Explicit rectangles may reverse either axis.
function texturePoint(name, [x, y, z]) {
  return {
    west: [z, 1 - y],
    east: [1 - z, 1 - y],
    north: [1 - x, 1 - y],
    south: [x, 1 - y],
    up: [x, z],
    down: [x, 1 - z],
  }[name];
}
export function modelFaces(model, variant = {}) {
  const result = [];
  for (const element of (model.elements ?? []).slice(0, 64))
    for (const [name, face] of Object.entries(element.faces ?? {})) {
      const [axis, sign] = directions[name],
        u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      const low = element.from.map((n) => n / 16),
        high = element.to.map((n) => n / 16);
      let points = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([du, dv]) => {
        const p = [...low];
        p[axis] = sign > 0 ? high[axis] : low[axis];
        p[u] = du ? high[u] : low[u];
        p[v] = dv ? high[v] : low[v];
        return p;
      });
      if (sign < 0) [points[1], points[3]] = [points[3], points[1]];
      const metrics = points.map((p) => texturePoint(name, p));
      const lowUv = [0, 1].map((i) => Math.min(...metrics.map((p) => p[i])));
      const highUv = [0, 1].map((i) => Math.max(...metrics.map((p) => p[i])));
      const uv = face.uv?.map((n) => n / 16) ?? [...lowUv, ...highUv];
      const coords = metrics.map((p) => {
        let u = (p[0] - lowUv[0]) / (highUv[0] - lowUv[0] || 1),
          v = (p[1] - lowUv[1]) / (highUv[1] - lowUv[1] || 1);
        // Sampling rotates oppositely to the visible clockwise texture.
        for (let i = 0; i < (face.rotation ?? 0) / 90; i++) [u, v] = [v, 1 - u];
        return [uv[0] + u * (uv[2] - uv[0]), uv[1] + v * (uv[3] - uv[1])];
      });
      if (element.rotation) {
        const r = element.rotation,
          index = { x: 0, y: 1, z: 2 }[r.axis];
        points = points.map((p) =>
          rotate(
            p,
            index,
            r.angle,
            r.origin.map((n) => n / 16),
          ),
        );
      }
      if (variant.x) points = points.map((p) => rotate(p, 0, -variant.x));
      if (variant.y) points = points.map((p) => rotate(p, 1, -variant.y));
      let cullface = face.cullface ?? null;
      if (cullface && directions[cullface]) {
        const [caxis, csign] = directions[cullface];
        let normal = [0, 0, 0];
        normal[caxis] = csign;
        if (variant.x) normal = rotate(normal, 0, -variant.x, [0, 0, 0]);
        if (variant.y) normal = rotate(normal, 1, -variant.y, [0, 0, 0]);
        cullface =
          Object.keys(directions).find((key) => {
            const [a, s] = directions[key];
            return normal[a] * s > 0.999;
          }) ?? null;
      }
      result.push({
        points,
        uv: coords,
        texture: resolveTexture(model.textures, face.texture),
        cullface,
        tintIndex: face.tintindex ?? -1,
      });
    }
  return result;
}
export function stateFaces(catalog, name, properties) {
  const entry = catalog[name];
  if (!entry) return null;
  return selectModels(entry.blockstate, properties)
    .flatMap((v) =>
      entry.models[v.model] ? modelFaces(entry.models[v.model], v) : [],
    )
    .slice(0, 256);
}
