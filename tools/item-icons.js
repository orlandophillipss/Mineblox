// Offline, bounded rasterization of supplied model pixels. Outputs stay private.
export function renderItemIcon(model, images, size = 32) {
  if (
    !Number.isInteger(size) ||
    size < 16 ||
    size > 64 ||
    model.faces.length > 128
  )
    throw new Error('Item icon exceeds compile budget');
  const display = model.display?.gui ?? {
    rotation: [30, 225, 0],
    scale: [0.625, 0.625, 0.625],
  };
  const [rx, ry, rz] = (display.rotation ?? [0, 0, 0]).map(
    (n) => (n * Math.PI) / 180,
  );
  const scale = display.scale ?? [1, 1, 1],
    shift = display.translation ?? [0, 0, 0];
  const rotate = ([x, y, z]) => {
    [x, y] = [
      x * Math.cos(rz) - y * Math.sin(rz),
      x * Math.sin(rz) + y * Math.cos(rz),
    ];
    [x, z] = [
      x * Math.cos(ry) + z * Math.sin(ry),
      -x * Math.sin(ry) + z * Math.cos(ry),
    ];
    return [
      x,
      y * Math.cos(rx) - z * Math.sin(rx),
      y * Math.sin(rx) + z * Math.cos(rx),
    ];
  };
  const pixels = Buffer.alloc(size * size * 4),
    depth = new Float64Array(size * size).fill(-Infinity);
  const sources = new Map();
  for (const face of model.faces) {
    const source = images[face.texture];
    if (!source) throw new Error('Item icon texture unavailable');
    if (!sources.has(face.texture))
      sources.set(face.texture, Buffer.from(source.hex, 'hex'));
    const bytes = sources.get(face.texture);
    const points = face.points.map((p) => {
      const v = rotate(p.map((n, i) => (n - 0.5) * scale[i]));
      return [
        size * (0.5 + v[0] + shift[0] / 16),
        size * (0.5 - v[1] - shift[1] / 16),
        v[2],
      ];
    });
    const [a, b, c] = face.points,
      ab = b.map((n, i) => n - a[i]),
      ac = c.map((n, i) => n - a[i]);
    const normal = rotate([
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ]);
    if (normal[2] <= 0) continue;
    const shade =
      Math.abs(normal[1]) > Math.abs(normal[0]) &&
      Math.abs(normal[1]) > Math.abs(normal[2])
        ? 1
        : 0.8;
    for (const indices of [
      [0, 1, 2],
      [0, 2, 3],
    ]) {
      const [a, b, c] = indices.map((i) => points[i]);
      const area =
        (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(area) < 1e-9) continue;
      for (
        let y = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
        y < Math.min(size, Math.ceil(Math.max(a[1], b[1], c[1])));
        y++
      )
        for (
          let x = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
          x < Math.min(size, Math.ceil(Math.max(a[0], b[0], c[0])));
          x++
        ) {
          const wa =
            ((b[1] - c[1]) * (x + 0.5 - c[0]) +
              (c[0] - b[0]) * (y + 0.5 - c[1])) /
            area;
          const wb =
              ((c[1] - a[1]) * (x + 0.5 - c[0]) +
                (a[0] - c[0]) * (y + 0.5 - c[1])) /
              area,
            wc = 1 - wa - wb;
          if (Math.min(wa, wb, wc) < -1e-8) continue;
          const at = x + y * size,
            z = wa * a[2] + wb * b[2] + wc * c[2];
          if (z <= depth[at]) continue;
          const uv = [0, 1].map(
            (axis) =>
              wa * face.uv[indices[0]][axis] +
              wb * face.uv[indices[1]][axis] +
              wc * face.uv[indices[2]][axis],
          );
          const tx = Math.min(
              source.width - 1,
              Math.max(0, Math.floor(uv[0] * source.width)),
            ),
            ty = Math.min(
              source.height - 1,
              Math.max(0, Math.floor(uv[1] * source.height)),
            );
          const from = (tx + ty * source.width) * 4;
          if (bytes[from + 3] < 128) continue;
          depth[at] = z;
          for (let channel = 0; channel < 3; channel++)
            pixels[at * 4 + channel] = Math.round(
              ((bytes[from + channel] * (face.tint?.[channel] ?? 255)) / 255) *
                shade,
            );
          pixels[at * 4 + 3] = 255;
        }
    }
  }
  return { width: size, height: size, hex: pixels.toString('hex') };
}

export function extrudeSprite(image) {
  const bytes = Buffer.from(image.hex, 'hex'),
    w = image.width,
    h = image.height,
    faces = [];
  const opaque = (x, y) =>
    x >= 0 && y >= 0 && x < w && y < h && bytes[(x + y * w) * 4 + 3] >= 128;
  for (const z of [7.5 / 16, 8.5 / 16])
    faces.push({
      points: [
        [0, 0, z],
        [1, 0, z],
        [1, 1, z],
        [0, 1, z],
      ],
      uv: [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (opaque(x, y)) {
        const l = x / w,
          r = (x + 1) / w,
          b = 1 - (y + 1) / h,
          t = 1 - y / h,
          front = 8.5 / 16,
          back = 7.5 / 16;
        const uv = Array.from({ length: 4 }, () => [
          (x + 0.5) / w,
          (y + 0.5) / h,
        ]);
        if (!opaque(x - 1, y))
          faces.push({
            points: [
              [l, b, back],
              [l, b, front],
              [l, t, front],
              [l, t, back],
            ],
            uv,
          });
        if (!opaque(x + 1, y))
          faces.push({
            points: [
              [r, b, front],
              [r, b, back],
              [r, t, back],
              [r, t, front],
            ],
            uv,
          });
        if (!opaque(x, y - 1))
          faces.push({
            points: [
              [l, t, front],
              [r, t, front],
              [r, t, back],
              [l, t, back],
            ],
            uv,
          });
        if (!opaque(x, y + 1))
          faces.push({
            points: [
              [l, b, back],
              [r, b, back],
              [r, b, front],
              [l, b, front],
            ],
            uv,
          });
      }
  return faces;
}
