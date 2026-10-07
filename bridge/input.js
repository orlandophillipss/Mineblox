import { createHash } from 'node:crypto';
export const PROTOCOL_VERSION = 1;
export const CONTROLS = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'sprint',
  'sneak',
];

export class BridgeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateInput(frame) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame))
    throw new BridgeError('Input must be an object');
  const allowed = ['version', 'seq', 'controls', 'yaw', 'pitch', 'slot'];
  if (Object.keys(frame).some((key) => !allowed.includes(key)))
    throw new BridgeError('Unknown input field');
  if (frame.version !== PROTOCOL_VERSION)
    throw new BridgeError('Unsupported protocol version', 426);
  if (!Number.isInteger(frame.seq) || frame.seq < 1 || frame.seq > 0xffffffff)
    throw new BridgeError('Invalid sequence');
  if (
    !Number.isInteger(frame.controls) ||
    frame.controls < 0 ||
    frame.controls > 127
  )
    throw new BridgeError('Invalid control mask');
  if (!Number.isFinite(frame.yaw) || Math.abs(frame.yaw) > Math.PI)
    throw new BridgeError('Yaw must be in [-pi, pi] radians');
  if (!Number.isFinite(frame.pitch) || Math.abs(frame.pitch) > Math.PI / 2)
    throw new BridgeError('Invalid pitch');
  if (
    frame.slot !== undefined &&
    (!Number.isInteger(frame.slot) || frame.slot < 0 || frame.slot > 8)
  )
    throw new BridgeError('Invalid hotbar slot');
  return frame;
}

export function minecraftName(robloxId, username) {
  if (typeof robloxId !== 'string' || !/^[1-9][0-9]{0,13}$/.test(robloxId))
    throw new BridgeError('Invalid Roblox user ID');
  if (username === undefined) return `RB${robloxId}`;
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(username))
    throw new BridgeError('Invalid Roblox username');
  return username.length <= 16
    ? username
    : username.slice(0, 11) +
        '_' +
        createHash('sha256').update(robloxId).digest('hex').slice(0, 4);
}
