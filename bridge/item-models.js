// Version-pinned build metadata. No Minecraft assets are embedded in source.
import { resolveTexture } from './assets.js';
import { modelFaces } from './models.js';
function guiNode(node, depth = 0) {
  if (!node || depth > 16)
    throw new Error('Invalid or excessive item-model nesting');
  const type = node.type?.replace(/^minecraft:/, '');
  if (type === 'model') return [node];
  if (type === 'composite') {
    if (!Array.isArray(node.models) || node.models.length > 8)
      throw new Error('Invalid composite item');
    return node.models.flatMap((n) => guiNode(n, depth + 1));
  }
  if (type === 'select' && node.property === 'minecraft:display_context') {
    const selected = node.cases?.find((c) =>
      (Array.isArray(c.when) ? c.when : [c.when]).includes('gui'),
    );
    return guiNode(selected?.model ?? node.fallback, depth + 1);
  }
  if (
    type === 'condition' &&
    ['minecraft:using_item', 'minecraft:bundle/has_selected_item'].includes(
      node.property,
    )
  )
    return guiNode(node.on_false, depth + 1);
  throw new Error(`Unsupported item model ${node.type ?? 'missing type'}`);
}
function tint(source) {
  if (!source) return undefined;
  if (source.type === 'minecraft:grass') return [145, 189, 89];
  if (source.type !== 'minecraft:constant')
    throw new Error(
      `Dynamic item tint ${source.type} requires stack component rendering`,
    );
  const value = source.value;
  return Array.isArray(value)
    ? value.map((n) => Math.round(n * 255))
    : [(value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}
export async function compileItem(store, name, loadImage, composeSprite) {
  if (!/^[a-z0-9_]{1,64}$/.test(name)) throw new Error('Invalid item name');
  const definition = await store.json(`assets/minecraft/items/${name}.json`);
  const nodes = guiNode(definition.model);
  const faces = [];
  let sprite;
  let display = {};
  for (const node of nodes) {
    const model = await store.model(
      node.model.includes(':') ? node.model : `minecraft:${node.model}`,
    );
    display = model.display ?? {};
    if (model.generated) {
      if (nodes.length !== 1)
        throw new Error(
          'Layered generated item requires explicit tint/composition',
        );
      const layers = [];
      for (let i = 0; i < 8 && model.textures[`layer${i}`]; i++) {
        const texture = resolveTexture(model.textures, `#layer${i}`);
        await loadImage(texture);
        layers.push({
          texture,
          ...(node.tints?.[i] ? { tint: tint(node.tints[i]) } : {}),
        });
      }
      if (!layers.length) throw new Error('Generated item has no layers');
      if (layers.length > 1 || layers[0].tint) {
        if (!composeSprite)
          throw new Error(
            'Layered generated item requires explicit tint/composition',
          );
        sprite = await composeSprite(name, layers);
      } else sprite = layers[0].texture;
    } else {
      const compiled = modelFaces(model);
      if (!compiled.length)
        throw new Error('Item model has no renderable faces');
      for (const face of compiled) {
        await loadImage(face.texture);
        const source = node.tints?.[face.tintIndex];
        const color = tint(source);
        faces.push({
          points: face.points,
          uv: face.uv,
          texture: face.texture,
          ...(color ? { tint: color } : {}),
        });
      }
    }
  }
  if (faces.length > 128) throw new Error('Item exceeds the face budget');
  return sprite
    ? { kind: 'sprite', texture: sprite, display }
    : { kind: 'mesh', faces, display };
}
export function auditItems(registry, itemModels, failures = {}) {
  const supported = [];
  const unresolved = [];
  for (const item of registry.itemsArray) {
    if (item.name === 'air') continue;
    if (itemModels[item.name]) supported.push(item.name);
    else
      unresolved.push({
        name: item.name,
        reason:
          failures[item.name] ?? 'Outside the prepared development asset set',
      });
  }
  return {
    minecraftVersion: '1.21.4',
    supported,
    supportedCount: supported.length,
    unresolved,
    unresolvedCount: unresolved.length,
  };
}
