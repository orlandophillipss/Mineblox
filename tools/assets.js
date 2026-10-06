import { parseArgs } from 'node:util';
import { AssetStore } from '../bridge/assets.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    version: { type: 'string', default: '1.21.4' },
    local: { type: 'string' },
    remote: { type: 'boolean', default: false },
  },
});
const relative = positionals[0];
if (!relative)
  throw new Error(
    'Usage: npm run assets -- [--remote | --local <extracted-root>] --version 1.21.4 assets/minecraft/models/block/stone.json',
  );
const store = new AssetStore({
  version: values.version,
  localRoot: values.local,
  allowRemote: values.remote,
});
const bytes = await store.get(relative);
console.log(
  JSON.stringify({
    cached: relative,
    version: values.version,
    bytes: bytes.length,
    root: store.cache,
  }),
);
