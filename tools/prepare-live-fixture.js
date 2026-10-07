import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const file = '.local/minecraft/ops.json';
if (process.argv.includes('--restore')) {
  const saved = JSON.parse(
    await readFile('.local/minecraft/ops-before-fixture.json', 'utf8'),
  );
  await writeFile(
    file,
    JSON.stringify(
      saved.filter(
        (o) => !['MinebloxTestAdmin', 'MinebloxAdmin'].includes(o.name),
      ),
      null,
      2,
    ),
  );
  console.log('Restored the original local operator list');
  process.exit(0);
}
const name = 'MinebloxAdmin';
const bytes = createHash('md5').update(`OfflinePlayer:${name}`).digest();
bytes[6] = (bytes[6] & 15) | 48;
bytes[8] = (bytes[8] & 63) | 128;
const h = bytes.toString('hex');
const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
let ops = [];
try {
  ops = JSON.parse(await readFile(file, 'utf8'));
} catch {
  /* Empty local development operator list. */
}
await writeFile(
  '.local/minecraft/ops-before-fixture.json',
  JSON.stringify(ops, null, 2),
);
if (!ops.some((o) => o.uuid === uuid))
  ops.push({ uuid, name, level: 4, bypassesPlayerLimit: false });
await writeFile(file, JSON.stringify(ops, null, 2));
console.log(
  'Prepared a dedicated local fixture operator. No Roblox user receives operator permissions. Restart the development server before testing.',
);
