import { BridgeError } from './input.js';
import { Vec3 } from 'vec3';
import { CREATIVE_TABS, inCreativeTab } from './creative.js';
import { createRequire } from 'node:module';
// Resolve the same item codec Mineflayer's creative plugin already uses.
const itemFactory = createRequire(import.meta.resolve('mineflayer'))(
  'prismarine-item',
);

const fields = {
  chat: ['text'],
  complete: ['text'],
  dig: ['target', 'hit'],
  cancelDig: [],
  place: ['target', 'face', 'hit'],
  useBlock: ['target', 'hit'],
  attack: ['entity'],
  useEntity: ['entity'],
  click: ['window', 'slot', 'button', 'mode'],
  distribute: ['window', 'slots', 'button'],
  closeWindow: ['window'],
  drop: ['all'],
  useItem: [],
  releaseItem: [],
  respawn: [],
  catalog: ['query', 'offset', 'tab'],
  creative: ['name', 'count', 'slot'],
};
export function validateAction(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || !fields[a.kind])
    throw new BridgeError('Unknown action');
  if (
    a.kind === 'catalog' &&
    a.tab !== undefined &&
    !CREATIVE_TABS.includes(a.tab)
  )
    throw new BridgeError('Invalid creative tab');
  if (
    !Number.isSafeInteger(a.seq) ||
    a.seq < 1 ||
    a.seq > 4294967295 ||
    !Number.isSafeInteger(a.epoch) ||
    a.epoch < 1
  )
    throw new BridgeError('Invalid action sequence/epoch');
  if (
    Object.keys(a).some(
      (k) => !['seq', 'epoch', 'kind', ...fields[a.kind]].includes(k),
    )
  )
    throw new BridgeError('Unknown action field');
  if (
    ['chat', 'complete'].includes(a.kind) &&
    (typeof a.text !== 'string' ||
      !a.text.length ||
      a.text.length > 256 ||
      [...a.text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
  )
    throw new BridgeError('Invalid chat/command');
  if (
    fields[a.kind].includes('target') &&
    (!Array.isArray(a.target) ||
      a.target.length !== 3 ||
      a.target.some((n) => !Number.isSafeInteger(n) || Math.abs(n) > 30000000))
  )
    throw new BridgeError('Invalid block target');
  if (
    a.kind === 'place' &&
    (!Array.isArray(a.face) ||
      a.face.length !== 3 ||
      a.face.some((n) => ![-1, 0, 1].includes(n)) ||
      a.face.reduce((sum, n) => sum + Math.abs(n), 0) !== 1)
  )
    throw new BridgeError('Invalid face');
  if (
    a.hit !== undefined &&
    (!Array.isArray(a.hit) ||
      a.hit.length !== 3 ||
      a.hit.some((n) => !Number.isFinite(n) || n < 0 || n > 1))
  )
    throw new BridgeError('Invalid block hit');
  if (
    fields[a.kind].includes('entity') &&
    (!Number.isSafeInteger(a.entity) || a.entity < 0)
  )
    throw new BridgeError('Invalid entity');
  if (
    fields[a.kind].includes('window') &&
    (!Number.isSafeInteger(a.window) || a.window < 0 || a.window > 255)
  )
    throw new BridgeError('Invalid window');
  if (
    a.kind === 'click' &&
    (!Number.isSafeInteger(a.slot) ||
      (a.slot !== -999 && (a.slot < 0 || a.slot > 255)) ||
      ![0, 1, 2, 3, 4, 6].includes(a.mode) ||
      !Number.isSafeInteger(a.button) ||
      a.button < 0 ||
      a.button > (a.mode === 2 ? 8 : a.mode === 3 ? 2 : 1) ||
      (a.mode === 3 && a.button !== 2) ||
      (a.mode === 6 && a.button !== 0))
  )
    throw new BridgeError('Invalid inventory click');
  if (
    a.kind === 'distribute' &&
    (!Array.isArray(a.slots) ||
      a.slots.length < 1 ||
      a.slots.length > 54 ||
      new Set(a.slots).size !== a.slots.length ||
      a.slots.some((n) => !Number.isInteger(n) || n < 0 || n > 255) ||
      ![0, 1].includes(a.button))
  )
    throw new BridgeError('Invalid inventory distribution');
  if (a.kind === 'drop' && typeof a.all !== 'boolean')
    throw new BridgeError('Invalid drop');
  if (
    a.kind === 'catalog' &&
    (typeof a.query !== 'string' ||
      a.query.length > 64 ||
      !/^[a-z0-9 _-]*$/i.test(a.query))
  )
    throw new BridgeError('Invalid item search');
  if (
    a.kind === 'catalog' &&
    a.offset !== undefined &&
    (!Number.isInteger(a.offset) || a.offset < 0 || a.offset > 65535)
  )
    throw new BridgeError('Invalid item search offset');
  if (
    a.kind === 'creative' &&
    (typeof a.name !== 'string' ||
      !/^[a-z0-9_]{1,64}$/.test(a.name) ||
      !Number.isInteger(a.count) ||
      a.count < 1 ||
      a.count > 64 ||
      !Number.isInteger(a.slot) ||
      a.slot < 36 ||
      a.slot > 44)
  )
    throw new BridgeError('Invalid creative item');
  return a;
}

// Discrete actions are bounded and deduplicated. They never delay movement.
export class Actions {
  constructor(player) {
    this.player = player;
    this.seq = 0;
    this.records = [];
    this.pending = 0;
    this.exclusive = false;
    this.dig = null;
    this.inventoryTail = Promise.resolve();
    this.placementTail = Promise.resolve();
    const bot = player.bot;
    // Mineflayer's dig helper predicts air locally at its completion timer.
    // Suppress only that update; terrain changes follow received server packets.
    const update = bot._updateBlockState?.bind(bot);
    if (update) {
      let serverPacket = false;
      for (const name of ['block_change', 'multi_block_change'])
        bot._client?.prependListener(name, () => {
          serverPacket = true;
          queueMicrotask(() => {
            serverPacket = false;
          });
        });
      bot._updateBlockState = (p, state) => {
        if (!serverPacket && state === 0 && this.dig?.equals(p)) return;
        return update(p, state);
      };
    }
  }
  submit(action) {
    validateAction(action);
    const previous = this.records.find((r) => r.seq === action.seq);
    if (previous) return previous;
    if (action.seq <= this.seq) throw new BridgeError('Stale action', 409);
    if (action.epoch !== this.player.worldEpoch)
      throw new BridgeError('Stale world action', 409);
    if (this.pending >= 4) throw new BridgeError('Action queue full', 429);
    this.seq = action.seq;
    const record = { seq: action.seq, kind: action.kind, status: 'pending' };
    this.records.push(record);
    if (this.records.length > 32) this.records.shift();
    this.pending++;
    const inventory = [
      'click',
      'distribute',
      'closeWindow',
      'creative',
    ].includes(action.kind);
    const task =
      action.kind === 'place'
        ? this.placementTail.then(() => this.execute(action))
        : inventory
          ? this.inventoryTail.then(() => this.inventoryTransaction(action))
          : this.execute(action);
    if (inventory) this.inventoryTail = task.catch(() => {});
    if (action.kind === 'place') this.placementTail = task.catch(() => {});
    void task
      .then(
        (value) => {
          record.status = 'sent';
          record.result = value ?? null;
        },
        (error) => {
          record.status = 'rejected';
          record.error = String(error.message).slice(0, 200);
        },
      )
      .finally(() => {
        this.pending--;
      });
    return record;
  }
  async inventoryTransaction(action) {
    let timer;
    try {
      return await Promise.race([
        this.execute(action),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            this.player.close?.('inventory response timeout');
            reject(
              new BridgeError(
                'Inventory response timeout; reconnect to resynchronize',
                504,
              ),
            );
          }, 8000);
          timer.unref();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async serverClick(window, slot, button, mode) {
    const bot = this.player.bot;
    if (!bot.supportFeature('stateIdUsed'))
      throw new BridgeError(
        'This inventory operation requires state-ID protocol support',
        426,
      );
    this.Item ??= itemFactory(bot.registry);
    // Pinned prismarine-windows cannot predict drag/double-click. Forward the
    // vanilla packet without inventing stack outcomes; state -1 requests the
    // full server inventory reply, including its carried stack.
    await new Promise((resolve, reject) => {
      const event = `setWindowItems:${window.id}`;
      const cleanup = () => {
        bot.off(event, done);
        bot.off('windowClose', closed);
        bot.off('end', closed);
      };
      const done = () => {
        cleanup();
        resolve();
      };
      const closed = () => {
        cleanup();
        reject(
          new BridgeError('Window closed during inventory operation', 409),
        );
      };
      bot.once(event, done);
      bot.once('windowClose', closed);
      bot.once('end', closed);
      try {
        bot._client.write('window_click', {
          windowId: window.id,
          stateId: -1,
          slot,
          mouseButton: button,
          mode,
          changedSlots: [],
          cursorItem: this.Item.toNotch(window.selectedItem),
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }
  block(target, hitPoint) {
    const bot = this.player.bot,
      position = new Vec3(...target),
      eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0);
    const block = bot.blockAt(position);
    const point = position.offset(...(hitPoint ?? [0.5, 0.5, 0.5]));
    const reach = bot.game?.gameMode === 'creative' ? 5 : 4.5;
    if (!block || eye.distanceTo(point) > reach + 0.001)
      throw new BridgeError('Block outside reach', 403);
    const delta = point.minus(eye);
    const hit = bot.world?.raycast(eye, delta.normalize(), reach + 0.001);
    if (hit && !hit.position.equals(position))
      throw new BridgeError('Block occluded', 403);
    return block;
  }
  async execute(a) {
    const bot = this.player.bot;
    if (this.player.status !== 'ready' || bot._client?.state !== 'play')
      throw new BridgeError('Player unavailable', 409);
    if (a.kind === 'chat') {
      bot.chat(a.text);
      return { forwarded: true };
    }
    if (a.kind === 'complete')
      return {
        suggestions: (await bot.tabComplete(a.text)).slice(0, 32).map((s) => ({
          text: typeof s === 'string' ? s : (s.match ?? s.text ?? ''),
          tooltip: null,
        })),
      };
    if (a.kind === 'cancelDig') {
      bot.stopDigging();
      this.dig = null;
      return;
    }
    if (a.kind === 'releaseItem') {
      bot.deactivateItem();
      return;
    }
    if (a.kind === 'respawn') {
      if ((bot.health ?? 20) > 0) throw new BridgeError('Player is alive', 409);
      bot.respawn();
      return;
    }
    if (['catalog', 'creative'].includes(a.kind)) {
      if (bot.game?.gameMode !== 'creative')
        throw new BridgeError('Creative mode required', 403);
      if (a.kind === 'catalog') {
        const query = a.query.toLowerCase().replaceAll(' ', '_');
        const matches = bot.registry.itemsArray.filter(
          (item) =>
            item.name !== 'air' &&
            (item.name.includes(query) ||
              item.displayName
                ?.toLowerCase()
                .includes(a.query.toLowerCase())) &&
            inCreativeTab(item, a.tab ?? 'search', bot.registry),
        );
        const offset = a.offset ?? 0;
        return {
          total: matches.length,
          offset,
          items: matches
            .slice(offset, offset + 64)
            .map(({ name, displayName, stackSize }) => ({
              name,
              displayName,
              stackSize,
            })),
        };
      }
      if (this.exclusive)
        throw new BridgeError('Another action is in flight', 409);
      const definition = bot.registry.itemsByName[a.name];
      if (!definition || a.count > definition.stackSize)
        throw new BridgeError('Invalid creative stack');
      if (bot.currentWindow)
        throw new BridgeError('Close the container first', 409);
      this.exclusive = true;
      try {
        this.Item ??= itemFactory(bot.registry);
        await bot.creative.setInventorySlot(
          a.slot,
          new this.Item(definition.id, a.count, 0),
        );
        return { slot: a.slot };
      } finally {
        this.exclusive = false;
      }
    }
    if (['attack', 'useEntity'].includes(a.kind)) {
      const entity = bot.entities[a.entity];
      if (
        !entity ||
        entity.id === bot.entity.id ||
        entity.position.distanceTo(bot.entity.position) > 4
      )
        throw new BridgeError('Entity outside reach', 403);
      if (
        [
          'item',
          'item_stack',
          'experience_orb',
          'arrow',
          'spectral_arrow',
          'trident',
        ].includes(entity.name)
      )
        throw new BridgeError('Entity does not accept interaction', 403);
      const eye = bot.entity.position.offset(0, 1.62, 0),
        delta = entity.position
          .offset(0, (entity.height ?? 1) / 2, 0)
          .minus(eye);
      const obstruction = bot.world?.raycast(
        eye,
        delta.normalize(),
        delta.norm(),
      );
      if (
        obstruction &&
        eye.distanceTo(obstruction.intersect) < delta.norm() - 0.2
      )
        throw new BridgeError('Entity occluded', 403);
      if (a.kind === 'attack') bot.attack(entity);
      else await bot.activateEntity(entity);
      return;
    }
    if (this.exclusive)
      throw new BridgeError('Another action is in flight', 409);
    this.exclusive = true;
    try {
      if (a.kind === 'dig') {
        const block = this.block(a.target, a.hit);
        if (!bot.canDigBlock(block))
          throw new BridgeError('Cannot dig block', 403);
        this.dig = block.position.clone();
        const ms = bot.digTime(block);
        this.player.event('digStart', { target: a.target, durationMs: ms });
        let timer;
        try {
          await Promise.race([
            bot.dig(block, true, 'raycast'),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('Dig response timeout')),
                Math.min(ms + 5000, 30000),
              );
              timer.unref();
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
        return { serverBlock: bot.blockAt(block.position)?.name };
      }
      if (a.kind === 'place') {
        const block = this.block(a.target, a.hit);
        if (!bot.heldItem) throw new BridgeError('No held item', 409);
        // The frontend already supplies held view intentions. Awaiting lookAt
        // conflicts with those updates and delays jump-and-place by more ticks.
        if (bot._placeBlockWithOptions)
          await bot._placeBlockWithOptions(block, new Vec3(...a.face), {
            forceLook: 'ignore',
            delta: a.hit ? new Vec3(...a.hit) : undefined,
            swingArm: 'right',
          });
        else await bot.placeBlock(block, new Vec3(...a.face));
        return {
          serverBlock: bot.blockAt(block.position.plus(new Vec3(...a.face)))
            ?.name,
        };
      }
      if (a.kind === 'useBlock') {
        await bot.activateBlock(this.block(a.target, a.hit));
        return;
      }
      if (a.kind === 'useItem') {
        bot.activateItem();
        return;
      }
      if (a.kind === 'drop') {
        if (bot.heldItem) {
          if (a.all) await bot.tossStack(bot.heldItem);
          else await bot.toss(bot.heldItem.type, bot.heldItem.metadata, 1);
        }
        return;
      }
      const window = bot.currentWindow ?? bot.inventory;
      if (window.id !== a.window)
        throw new BridgeError('Window changed; resynchronize', 409);
      if (a.kind === 'closeWindow') {
        await bot.closeWindow(window);
        if (bot._syncWindow) await bot._syncWindow(bot.inventory);
        return;
      }
      if (a.kind === 'distribute') {
        if (a.slots.some((slot) => slot >= window.slots.length))
          throw new BridgeError('Invalid slot');
        const base = a.button === 1 ? 4 : 0;
        await this.serverClick(window, -999, base, 5);
        for (const slot of a.slots)
          await this.serverClick(window, slot, base + 1, 5);
        await this.serverClick(window, -999, base + 2, 5);
        return { window: window.id };
      }
      if (a.kind === 'click') {
        if (a.slot !== -999 && a.slot >= window.slots.length)
          throw new BridgeError('Invalid slot');
        if (a.mode === 3 && bot.game?.gameMode !== 'creative')
          throw new BridgeError('Creative mode required', 403);
        if ([3, 6].includes(a.mode))
          await this.serverClick(window, a.slot, a.button, a.mode);
        else await bot.clickWindow(a.slot, a.button, a.mode);
        return { window: window.id };
      }
    } finally {
      this.exclusive = false;
      if (a.kind === 'dig') {
        bot.stopDigging();
        this.dig = null;
      }
    }
  }
}
