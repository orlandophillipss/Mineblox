import { EventEmitter } from 'node:events';

export function fakeBot() {
  const bot = new EventEmitter();
  bot.entity = {
    id: 42,
    position: { x: 1, y: 64, z: -2 },
    yaw: 0,
    pitch: 0,
    onGround: true,
  };
  bot._client = { state: 'play' };
  bot.health = 20;
  bot.food = 20;
  bot.game = { dimension: 'overworld' };
  bot.controls = {};
  bot.setControlState = (key, value) => {
    bot.controls[key] = value;
  };
  bot.clearControlStates = () => {
    bot.controls = {};
  };
  bot.look = async (yaw, pitch) => {
    bot.entity.yaw = yaw;
    bot.entity.pitch = pitch;
  };
  bot.quit = () => {
    bot.quitCount = (bot.quitCount ?? 0) + 1;
    bot.emit('end');
  };
  return bot;
}
