import mineflayer from 'mineflayer';
import { createGateway } from './gateway.js';
import { minecraftConfig } from './config.js';
import { ContentStore } from './content.js';
const content = new ContentStore();
try {
  await content.reload();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const poll = setInterval(() => {
  void content.reload().catch((error) => {
    if (error.code !== 'ENOENT')
      console.error(`Content update rejected: ${error.message}`);
  });
}, 60000);
poll.unref();

const log = (record) =>
  console.log(
    JSON.stringify({ timestamp: new Date().toISOString(), ...record }),
  );
const gateway = createGateway({
  token: process.env.BRIDGE_TOKEN,
  minecraft: minecraftConfig(),
  createBot: mineflayer.createBot,
  log,
  requireOwner: process.env.MINEBLOX_DEPLOYMENT === 'true',
  content: () => content.current,
});
const host = process.env.BRIDGE_HOST ?? '127.0.0.1';
const port = Number(process.env.BRIDGE_PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid BRIDGE_PORT');
gateway.server.listen(port, host, () =>
  log({ event: 'gateway_listening', host, port }),
);
gateway.server.on('error', (error) => {
  log({ event: 'gateway_error', message: error.message });
  process.exitCode = 1;
  void gateway.close();
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void gateway.close();
  });
