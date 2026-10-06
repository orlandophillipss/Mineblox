import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
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
    this.name = minecraftName(robloxId);
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
    this.log = log;
    this.bot = createBot({
      ...minecraft,
      username: this.name,
      auth: 'offline',
      viewDistance: 'tiny',
    });
    this.bot.on('spawn', () => {
      if (this.status === 'closed') return;
      this.status = 'ready';
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
    this.lastInput = started;
    this.lastActivity = started;
    this.controlsActive = frame.controls !== 0;
    return { acceptedSeq: this.seq, processingMs: this.now() - started };
  }

  position() {
    const p = this.bot.entity?.position;
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  snapshot() {
    return {
      version: PROTOCOL_VERSION,
      id: this.id,
      robloxId: this.robloxId,
      status: this.status,
      acceptedSeq: this.seq,
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
