import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { Actions } from './actions.js';
import {
  BridgeError,
  CONTROLS,
  PROTOCOL_VERSION,
  minecraftName,
  validateInput,
} from './input.js';

// Mineflayer owns the player/world state. This wrapper owns identity, input leases,
// and delivery metadata; it never computes health, damage, or world outcomes.
export class VirtualPlayer extends EventEmitter {
  constructor({
    robloxId,
    username,
    displayName,
    createBot,
    minecraft,
    now = () => performance.now(),
    inputLeaseMs = 750,
    idleMs = 30000,
    log = () => {},
  }) {
    super();
    this.id = randomUUID();
    this.robloxId = robloxId;
    this.name = minecraftName(robloxId, username);
    this.username = username ?? this.name;
    this.displayName = displayName ?? this.username;
    this.seq = 0;
    this.status = 'connecting';
    this.now = now;
    this.createdAt = now();
    this.lastActivity = this.createdAt;
    this.lastInput = -Infinity;
    this.inputLeaseMs = inputLeaseMs;
    this.idleMs = idleMs;
    this.controlsActive = false;
    this.inputTokens = 20;
    this.tokenTime = this.createdAt;
    this.lastCorrection = null;
    this.correctionRevision = 0;
    this.worldEpoch = 0;
    this.log = log;
    this.bot = createBot({
      ...minecraft,
      username: this.name,
      auth: 'offline',
      viewDistance: 'tiny',
    });
    this.events = [];
    this.eventSeq = 0;
    this.physicsTick = 0;
    this.actions = new Actions(this);
    this.bot.on('physicsTick', () => {
      this.physicsTick++;
    });
    this.bot.on('messagestr', (text, position, _message, sender) =>
      this.event('chat', {
        text: String(text).slice(0, 512),
        position,
        sender: sender ?? null,
      }),
    );
    this.bot.on('health', () =>
      this.event('health', { health: this.bot.health, food: this.bot.food }),
    );
    this.bot.on('entityHurt', (entity) =>
      this.event('entityHurt', { id: entity.id }),
    );
    this.bot.on('playerCollect', (collector, collected) =>
      this.event('pickup', {
        collector: collector.id,
        collected: collected.id,
      }),
    );
    this.bot.on('soundEffectHeard', (...args) =>
      this.event('sound', {
        name: String(args[0]?.soundName ?? args[0]).slice(0, 100),
      }),
    );
    this.bot.on('spawn', () => {
      if (this.status === 'closed') return;
      this.status = 'ready';
      this.worldEpoch++;
      this.log({
        event: 'player_spawn',
        session: this.id,
        elapsedMs: now() - this.createdAt,
      });
      this.emit('ready');
    });
    this.bot.on('forcedMove', () => {
      this.correctionRevision++;
      this.lastCorrection = {
        revision: this.correctionRevision,
        receivedAtMs: now(),
        position: this.position(),
        yaw: this.bot.entity.yaw,
        pitch: this.bot.entity.pitch,
      };
      this.emit('correction', this.lastCorrection);
    });
    this.bot.on('error', (error) => {
      this.log({
        event: 'player_error',
        session: this.id,
        message: error.message,
      });
      this.emit('failure', error);
      this.close('protocol error');
    });
    this.bot.on('kicked', () => this.close('kicked'));
    this.bot.on('end', () => this.finish());
  }

  async ready(timeoutMs = 15000) {
    if (this.status === 'ready') return;
    if (this.status === 'closed')
      throw new BridgeError('Minecraft disconnected', 502);
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.off('ready', onReady);
        this.off('failure', onFailure);
        this.off('closed', onClosed);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onFailure = (error) => {
        cleanup();
        reject(new BridgeError(error.message, 502));
      };
      const onClosed = () =>
        onFailure(new Error('Minecraft disconnected before spawn'));
      const timer = setTimeout(() => {
        cleanup();
        this.close('spawn timeout');
        reject(new BridgeError('Minecraft spawn timeout', 504));
      }, timeoutMs);
      this.once('ready', onReady);
      this.once('failure', onFailure);
      this.once('closed', onClosed);
    });
  }

  apply(frame) {
    validateInput(frame);
    if (this.status !== 'ready')
      throw new BridgeError('Player is not ready', 409);
    // Minecraft changes protocol state during transfers/dimension transitions.
    if (this.bot._client?.state !== 'play')
      throw new BridgeError('Minecraft is reconfiguring', 409);
    if (frame.seq <= this.seq)
      throw new BridgeError('Stale or duplicate input', 409);
    const started = this.now();
    this.inputTokens = Math.min(
      20,
      this.inputTokens + (started - this.tokenTime) * 0.02,
    );
    this.tokenTime = started;
    if (this.inputTokens < 1)
      throw new BridgeError('Player input rate exceeded', 429);
    this.inputTokens--;
    for (let i = 0; i < CONTROLS.length; i++)
      this.bot.setControlState(CONTROLS[i], Boolean(frame.controls & (1 << i)));
    // Never accept a position from Roblox. Mature client physics emits normal
    // movement packets, and the Minecraft server can correct/reject those moves.
    void this.bot.look(frame.yaw, frame.pitch, true).catch((error) => {
      this.log({
        event: 'look_error',
        session: this.id,
        message: error.message,
      });
      this.close('look error');
    });
    this.seq = frame.seq;
    if (frame.slot !== undefined) this.bot.setQuickBarSlot(frame.slot);
    this.lastInput = started;
    this.lastActivity = started;
    this.controlsActive = frame.controls !== 0;
    return { acceptedSeq: this.seq, processingMs: this.now() - started };
  }

  position() {
    const p = this.bot.entity?.position;
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  event(kind, data) {
    this.events.push({ seq: ++this.eventSeq, kind, data });
    if (this.events.length > 32) this.events.shift();
  }

  snapshot() {
    return {
      version: PROTOCOL_VERSION,
      id: this.id,
      robloxId: this.robloxId,
      minecraftName: this.name,
      username: this.username,
      displayName: this.displayName,
      status: this.status,
      acceptedSeq: this.seq,
      physicsTick: this.physicsTick,
      jumpTicks: this.bot.jumpTicks ?? 0,
      events: this.events.slice(-16),
      actions: this.actions.records.slice(-16),
      gameMode: this.bot.game?.gameMode ?? 'survival',
      inventory: (() => {
        const window = this.bot.currentWindow ?? this.bot.inventory;
        const serialize = (item) =>
          item
            ? {
                name: item.name,
                displayName: item.displayName ?? item.name,
                count: item.count,
                type: item.type,
                slot: item.slot,
              }
            : false;
        return window
          ? {
              id: window.id,
              type: window.type ?? 'minecraft:inventory',
              title:
                typeof window.title === 'string'
                  ? window.title.slice(0, 100)
                  : 'Inventory',
              inventoryStart: window.inventoryStart ?? 9,
              inventoryEnd: window.inventoryEnd ?? 45,
              slots: Array.from(window.slots, serialize),
              cursor: serialize(window.selectedItem),
            }
          : null;
      })(),
      bridgeTimeMs: this.now(),
      entityId: this.bot.entity?.id ?? null,
      minecraftUuid: this.bot.player?.uuid ?? null,
      // Normal Minecraft servers do not acknowledge each accepted position.
      // Keep client prediction and server corrections explicitly distinct.
      predicted: this.bot.entity
        ? {
            position: this.position(),
            yaw: this.bot.entity.yaw,
            pitch: this.bot.entity.pitch,
            onGround: this.bot.entity.onGround,
          }
        : null,
      correction: this.lastCorrection,
      health: this.bot.health ?? null,
      hunger: this.bot.food ?? null,
      timeOfDay: this.bot.time?.timeOfDay ?? null,
      selectedSlot: this.bot.quickBarSlot ?? 0,
      worldEpoch: this.worldEpoch,
      velocity: this.bot.entity?.velocity
        ? {
            x: this.bot.entity.velocity.x,
            y: this.bot.entity.velocity.y,
            z: this.bot.entity.velocity.z,
          }
        : { x: 0, y: 0, z: 0 },
      experience: this.bot.experience ?? { level: 0, progress: 0 },
      hotbar: Array.from({ length: 9 }, (_, i) => {
        const item = this.bot.inventory?.slots[36 + i];
        return item ? { name: item.name, count: item.count } : null;
      }),
      entities: Object.values(this.bot.entities ?? {})
        .filter(
          (e) =>
            e.id !== this.bot.entity?.id &&
            e.position &&
            e.position.distanceTo(this.bot.entity.position) <= 48,
        )
        .slice(0, 128)
        .map((e) => ({
          id: e.id,
          type: e.type,
          name: e.username ?? e.name ?? 'entity',
          position: { x: e.position.x, y: e.position.y, z: e.position.z },
          yaw: e.yaw ?? 0,
          pitch: e.pitch ?? 0,
          velocity: e.velocity
            ? { x: e.velocity.x, y: e.velocity.y, z: e.velocity.z }
            : { x: 0, y: 0, z: 0 },
          width: e.width ?? 0.6,
          height: e.height ?? 1.8,
          flags: e.metadata?.[0] ?? 0,
          item: (() => {
            try {
              const item = e.getDroppedItem?.();
              return item ? { name: item.name, count: item.count } : null;
            } catch {
              return null;
            }
          })(),
        })),
      dimension: this.bot.game?.dimension ?? null,
    };
  }

  maintain() {
    if (this.status === 'closed') return;
    if (
      this.controlsActive &&
      this.now() - this.lastInput >= this.inputLeaseMs
    ) {
      this.bot.clearControlStates();
      this.controlsActive = false;
    }
    if (this.now() - this.lastActivity >= this.idleMs)
      this.close('idle timeout');
  }

  close(reason = 'bridge disconnect') {
    if (this.status === 'closed') return;
    this.bot.clearControlStates?.();
    this.finish();
    this.bot.quit(reason);
  }

  finish() {
    if (this.status === 'closed') return;
    this.status = 'closed';
    this.controlsActive = false;
    this.log({ event: 'player_closed', session: this.id });
    this.emit('closed');
  }
}
