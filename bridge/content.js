import { readFile } from 'node:fs/promises';
export const EMPTY_CONTENT = {
  format: 1,
  version: '0.0.0',
  images: {},
  blocks: {},
  gui: {},
  items: {},
  entities: {},
};
export function validateContent(value) {
  if (
    !value ||
    value.format !== 1 ||
    typeof value.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(value.version)
  )
    throw new Error('Content requires format 1 and a semantic version');
  if (Buffer.byteLength(JSON.stringify(value)) > 65536)
    throw new Error('Content manifest exceeds 64 KiB');
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'format',
          'version',
          'images',
          'blocks',
          'gui',
          'items',
          'entities',
        ].includes(key),
    )
  )
    throw new Error('Unknown content manifest field');
  for (const field of ['images', 'blocks', 'gui', 'items', 'entities'])
    if (
      !value[field] ||
      typeof value[field] !== 'object' ||
      Array.isArray(value[field]) ||
      Object.keys(value[field]).length > 512
    )
      throw new Error('Invalid content map');
  for (const [key, image] of Object.entries(value.images)) {
    if (
      key.length > 160 ||
      !image ||
      Object.keys(image).some((key) => !['assetId', 'alpha'].includes(key)) ||
      !/^rbxassetid:\/\/[1-9]\d{0,19}$/.test(image.assetId) ||
      typeof image.alpha !== 'boolean'
    )
      throw new Error(
        'Content images must use permitted Roblox asset IDs and an alpha flag; raw pixels and executable code are forbidden',
      );
  }
  const reference = (key) => {
    if (typeof key !== 'string' || !Object.hasOwn(value.images, key))
      throw new Error('Content references an unknown image');
  };
  for (const faces of Object.values(value.blocks)) {
    if (!Array.isArray(faces) || faces.length !== 6)
      throw new Error('A block needs six face images');
    faces.forEach(reference);
  }
  for (const field of ['gui', 'items', 'entities'])
    for (const key of Object.values(value[field])) reference(key);
  return structuredClone(value);
}
export class ContentStore {
  constructor(file = '.local/content/catalog.json') {
    this.file = file;
    this.current = EMPTY_CONTENT;
  }
  async reload() {
    const bytes = await readFile(this.file);
    if (bytes.length > 65536)
      throw new Error('Content manifest exceeds 64 KiB');
    const next = validateContent(JSON.parse(bytes));
    if (
      next.version === this.current.version &&
      JSON.stringify(next) !== JSON.stringify(this.current)
    )
      throw new Error('Content changes require a new version');
    this.current = next;
    return next;
  }
}
