// Negotiated terrain v2. Uniform/RLE sections reduce JSON overhead without
// inventing a Roblox binary HTTP API. Worst-case data falls back to v1 values.
export function encodeVoxels(values) {
  if (
    values.length !== 512 ||
    Array.from(values).some(
      (n) => !Number.isInteger(n) || n < 0 || n > 0xffffffff,
    )
  )
    throw new Error('Invalid partition voxels');
  const runs = [];
  let state = values[0],
    count = 0;
  for (const value of values) {
    if (value !== state) {
      runs.push(count, state);
      count = 0;
      state = value;
    }
    count++;
  }
  runs.push(count, state);
  if (runs.length === 2) return { encoding: 'uniform', state };
  const rle = { encoding: 'rle', runs };
  const raw = { encoding: 'array', values: Array.from(values) };
  return JSON.stringify(rle).length < JSON.stringify(raw).length ? rle : raw;
}
