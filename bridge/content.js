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
    ![1, 2].includes(value.format) ||
    typeof value.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(value.version)
  )
    throw new Error('Content requires format 1 or 2 and a semantic version');
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
          ...(value.format === 2 ? ['itemModels'] : []),
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
  if (value.format === 2) {
    if (
      !value.itemModels ||
      typeof value.itemModels !== 'object' ||
      Array.isArray(value.itemModels) ||
      Object.keys(value.itemModels).length > 256
    )
      throw new Error('Invalid item model map');
    const vector = (v, min, max) =>
      Array.isArray(v) &&
      v.length === 3 &&
      v.every((n) => Number.isFinite(n) && n >= min && n <= max);
    for (const [name, model] of Object.entries(value.itemModels)) {
      if (
        !/^[a-z0-9_]{1,64}$/.test(name) ||
        !model ||
        Object.keys(model).some(
          (k) =>
            !['kind', 'texture', 'faces', 'display', 'blockItem'].includes(k),
        ) ||
        (model.blockItem !== undefined && typeof model.blockItem !== 'boolean')
      )
        throw new Error('Invalid item model');
      if (model.kind === 'sprite') {
        reference(model.texture);
        if (model.faces !== undefined)
          throw new Error('Sprite cannot contain geometry');
      } else if (model.kind === 'mesh') {
        if (
          model.texture !== undefined ||
          !Array.isArray(model.faces) ||
          model.faces.length < 1 ||
          model.faces.length > 128
        )
          throw new Error('Invalid item geometry');
        for (const face of model.faces) {
          if (
            !face ||
            Object.keys(face).some(
              (k) => !['points', 'uv', 'texture', 'tint'].includes(k),
            ) ||
            !Array.isArray(face.points) ||
            face.points.length !== 4 ||
            face.points.some((v) => !vector(v, -4, 4)) ||
            !Array.isArray(face.uv) ||
            face.uv.length !== 4 ||
            face.uv.some(
              (v) =>
                !Array.isArray(v) ||
                v.length !== 2 ||
                v.some((n) => !Number.isFinite(n) || n < -4 || n > 4),
            ) ||
            (face.tint !== undefined &&
              (!vector(face.tint, 0, 255) ||
                face.tint.some((n) => !Number.isInteger(n))))
          )
            throw new Error('Invalid item face');
          reference(face.texture);
        }
      } else throw new Error('Unsupported item model kind');
      if (model.display !== undefined) {
        if (
          !model.display ||
          typeof model.display !== 'object' ||
          Array.isArray(model.display) ||
          Object.keys(model.display).length > 8
        )
          throw new Error('Invalid item display');
        for (const [context, transform] of Object.entries(model.display)) {
          if (
            ![
              'gui',
              'ground',
              'fixed',
              'head',
              'firstperson_lefthand',
              'firstperson_righthand',
              'thirdperson_lefthand',
              'thirdperson_righthand',
            ].includes(context) ||
            !transform ||
            Object.keys(transform).some(
              (k) => !['rotation', 'translation', 'scale'].includes(k),
            )
          )
            throw new Error('Invalid item display context');
          if (
            (transform.rotation !== undefined &&
              !vector(transform.rotation, -360, 360)) ||
            (transform.translation !== undefined &&
              !vector(transform.translation, -80, 80)) ||
            (transform.scale !== undefined &&
              !vector(transform.scale, 0.0001, 8))
          )
            throw new Error('Invalid item display transform');
        }
      }
    }
  }
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
