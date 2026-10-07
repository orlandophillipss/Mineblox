import { BridgeError } from './input.js';
import { Vec3 } from 'vec3';

const fields = {
  chat: ['text'],
  complete: ['text'],
  dig: ['target'],
  cancelDig: [],
  place: ['target', 'face'],
  useBlock: ['target'],
  attack: ['entity'],
  useEntity: ['entity'],
  click: ['window', 'slot', 'button', 'mode'],
  closeWindow: ['window'],
  drop: ['all'],
  useItem: [],
  respawn: [],
};
export function validateAction(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || !fields[a.kind])
    throw new BridgeError('Unknown action');
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
      ![0, 1, 2, 4].includes(a.mode) ||
      !Number.isSafeInteger(a.button) ||
      a.button < 0 ||
      a.button > (a.mode === 2 ? 8 : 1))
  )
    throw new BridgeError('Invalid inventory click');
  if (a.kind === 'drop' && typeof a.all !== 'boolean')
    throw new BridgeError('Invalid drop');
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
    void this.execute(action)
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
  block(target) {
    const bot = this.player.bot,
      position = new Vec3(...target),
      eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0);
    const block = bot.blockAt(position);
    if (!block || eye.distanceTo(position.offset(0.5, 0.5, 0.5)) > 5.1)
      throw new BridgeError('Block outside reach', 403);
    const delta = position.offset(0.5, 0.5, 0.5).minus(eye);
    const hit = bot.world?.raycast(eye, delta.normalize(), 5.1);
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
    if (a.kind === 'respawn') {
      if ((bot.health ?? 20) > 0) throw new BridgeError('Player is alive', 409);
      bot.respawn();
      return;
    }
    if (['attack', 'useEntity'].includes(a.kind)) {
      const entity = bot.entities[a.entity];
      if (
        !entity ||
        entity.id === bot.entity.id ||
        entity.position.distanceTo(bot.entity.position) > 4
      )
        throw new BridgeError('Entity outside reach', 403);
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
        const block = this.block(a.target);
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
        const block = this.block(a.target);
        if (!bot.heldItem) throw new BridgeError('No held item', 409);
        await bot.placeBlock(block, new Vec3(...a.face));
        return {
          serverBlock: bot.blockAt(block.position.plus(new Vec3(...a.face)))
            ?.name,
        };
      }
      if (a.kind === 'useBlock') {
        await bot.activateBlock(this.block(a.target));
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
        if (bot.currentWindow) bot.closeWindow(bot.currentWindow);
        return;
      }
      if (a.kind === 'click') {
        if (a.slot !== -999 && a.slot >= window.slots.length)
          throw new BridgeError('Invalid slot');
        await bot.clickWindow(a.slot, a.button, a.mode);
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
