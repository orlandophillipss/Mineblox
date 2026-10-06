import mineflayer from 'mineflayer';
import { createInterface } from 'node:readline';
import { VirtualPlayer } from '../bridge/session.js';
import { minecraftConfig } from '../bridge/config.js';
import { CONTROLS } from '../bridge/input.js';

const player = new VirtualPlayer({
  robloxId: process.argv[2] ?? '1',
  createBot: mineflayer.createBot,
  minecraft: minecraftConfig(),
  inputLeaseMs: 1500,
  idleMs: 300000,
  log: (r) => console.log(JSON.stringify(r)),
});
const maintain = setInterval(() => player.maintain(), 100);
const rl = createInterface({ input: process.stdin, output: process.stdout });
player.once('closed', () => {
  clearInterval(maintain);
  rl.close();
});
try {
  await player.ready();
  console.log(
    'Commands: forward, back, left, right, jump, sprint, sneak (combine with spaces), stop, look <yaw> <pitch> in radians, state, quit. Movement expires after 1.5s; repeat to renew.',
  );
  let yaw = 0;
  let pitch = 0;
  rl.on('line', (line) => {
    const args = line.trim().split(/\s+/);
    try {
      if (args[0] === 'quit') {
        player.close();
        return;
      }
      if (args[0] === 'state') {
        console.log(JSON.stringify(player.snapshot()));
        return;
      }
      if (args[0] === 'look' && args.length === 3) {
        yaw = Number(args[1]);
        pitch = Number(args[2]);
        args.splice(0);
      } else if (args[0] === 'stop') args.splice(0);
      else if (args.some((s) => !CONTROLS.includes(s)))
        throw new Error('Unknown command');
      const controls = args.reduce(
        (mask, s) => mask | (1 << CONTROLS.indexOf(s)),
        0,
      );
      console.log(
        JSON.stringify(
          player.apply({
            version: 1,
            seq: player.seq + 1,
            controls,
            yaw,
            pitch,
          }),
        ),
      );
    } catch (error) {
      console.error(error.message);
    }
  });
  rl.once('close', () => player.close());
} catch (error) {
  console.error(error.message);
  player.close();
  process.exitCode = 1;
}
