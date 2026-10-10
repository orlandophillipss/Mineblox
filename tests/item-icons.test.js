import test from 'node:test';
import assert from 'node:assert/strict';
import { renderItemIcon, extrudeSprite } from '../tools/item-icons.js';

test('compiled GUI icons retain alpha holes and nearest-pixel colours without runtime meshes', () => {
  const image = {
    width: 2,
    height: 2,
    hex: Buffer.from([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
    ]).toString('hex'),
  };
  const model = {
    faces: [
      {
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
          [0, 1, 0],
        ],
        uv: [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
        texture: 'test',
      },
    ],
    display: { gui: {} },
  };
  const icon = renderItemIcon(model, { test: image });
  const bytes = Buffer.from(icon.hex, 'hex');
  assert.deepEqual(
    [...bytes.subarray((8 + 8 * 32) * 4, (8 + 8 * 32) * 4 + 4)],
    [204, 0, 0, 255],
  );
  assert.equal(bytes[(24 + 24 * 32) * 4 + 3], 0);
  assert.throws(() => renderItemIcon(model, { test: image }, 1024), /budget/);
});
test('held sprites have solid pixel edge thickness while leaving transparent pixels open', () => {
  const faces = extrudeSprite({ width: 1, height: 1, hex: 'ffffffff' });
  assert.equal(faces.length, 6);
  assert.deepEqual(
    [...new Set(faces.flatMap((f) => f.points.map((p) => p[2])))].sort(),
    [7.5 / 16, 8.5 / 16],
  );
  assert.equal(
    extrudeSprite({ width: 1, height: 1, hex: '00000000' }).length,
    2,
  );
});
