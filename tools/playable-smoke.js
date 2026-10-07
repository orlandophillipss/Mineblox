import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { performance } from 'node:perf_hooks';
const client = new Client({
  name: 'mineblox-gameplay-proof',
  version: '0.2.0',
});
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('tools/mcp-proxy.js')],
  }),
);
const { id } = JSON.parse(await readFile('.local/studio.json', 'utf8'));
const call = (name, args) =>
  client.callTool({ name, arguments: { studio_id: id, ...args } }, undefined, {
    timeout: 60000,
  });
async function lua(code) {
  const r = await call('execute_luau', { datamodel_type: 'Client', code });
  if (r.isError) throw new Error(JSON.stringify(r));
  return JSON.parse(r.content.find((c) => c.type === 'text').text);
}
const snapshot = () =>
  lua(
    'return game.HttpService:JSONEncode(game.Players.LocalPlayer.PlayerGui.MinebloxDiagnostics:Invoke("snapshot"))',
  );
const action = (fields) =>
  lua(
    `return game.HttpService:JSONEncode(game.Players.LocalPlayer.PlayerGui.MinebloxDiagnostics:Invoke("action",game.HttpService:JSONDecode(${JSON.stringify(JSON.stringify(fields))})))`,
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, label, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}
const admin = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  auth: 'offline',
  username: 'MinebloxAdmin',
  version: '1.21.4',
  viewDistance: 'short',
});
const messages = [];
admin.on('messagestr', (text) => messages.push(text));
let initial;
const results = {
  date: new Date().toISOString(),
  checks: {},
  note: 'Actual Roblox client remotes/UI and Minecraft server outcomes, with a dedicated local test operator. Roblox identity is not promoted. GUI Minecraft presence is checked separately.',
};
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Fixture login timeout')),
      15000,
    );
    admin.once('spawn', () => {
      clearTimeout(timer);
      resolve();
    });
    admin.once('error', reject);
    admin.once('kicked', (reason) =>
      reject(new Error(`Fixture kicked: ${JSON.stringify(reason)}`)),
    );
  });
  initial = await until(snapshot, 'Roblox Minecraft connection', 30000);
  const name = initial.minecraftName ?? `RB${initial.robloxId}`;
  const command = async (text) => {
    admin.chat(text);
    await sleep(200);
  };
  if (!process.argv.includes('--headless'))
    await until(
      () => admin.players.MCGraphObserver,
      'graphical Minecraft client connected',
      20000,
    );
  await command('/tp MCGraphObserver 64.5 231 67.5 180 0');
  await command('/tp MinebloxAdmin 64.5 231 64.5');
  await command('/fill 50 229 50 78 229 78 stone');
  await command('/time set day');
  await command(`/tp ${name} 64.5 230 64.5 0 0`);
  await command(`/item replace entity ${name} hotbar.0 with stone 16`);
  await command(`/give ${name} iron_pickaxe 1`);
  await until(async () => {
    const s = await snapshot();
    return (
      s.predicted.position.y === 230 &&
      s.inventory.slots.some((i) => i && i.name === 'stone')
    );
  }, 'test position and Minecraft inventory');
  await command('/setblock 64 231 62 dirt');
  await until(
    () => admin.blockAt(new Vec3(64, 231, 62))?.name === 'dirt',
    'fixture block',
  );
  await action({ kind: 'chat', text: 'Mineblox crossplay chat proof' });
  await until(
    () => messages.some((m) => m.includes('Mineblox crossplay chat proof')),
    'Roblox chat reaches Minecraft',
  );
  results.checks.robloxToMinecraftChat = true;
  await command('Minecraft to Roblox chat proof');
  await until(async () => {
    const s = await snapshot();
    return s.events.some(
      (e) =>
        e.kind === 'chat' &&
        e.data.text.includes('Minecraft to Roblox chat proof'),
    );
  }, 'Minecraft chat reaches Roblox');
  results.checks.minecraftToRobloxChat = true;
  await action({ kind: 'chat', text: '/gamemode creative' });
  await sleep(700);
  const denied = await snapshot();
  assert.equal(denied.gameMode, 'survival');
  results.checks.commandsRespectPermissions = true;
  const item = denied.inventory.slots[36];
  assert.ok(item);
  const slot = item.slot;
  await action({ kind: 'click', window: 0, slot, button: 1, mode: 0 });
  await until(async () => {
    const s = await snapshot();
    return (
      s.inventory.cursor &&
      s.inventory.cursor.name === 'stone' &&
      s.inventory.cursor.count === 8
    );
  }, 'right click splits Minecraft stack');
  const destination = denied.inventory.slots.findIndex(
    (i, index) => index >= 9 && index < 36 && !i,
  );
  assert.ok(destination >= 9, 'empty fixture inventory slot');
  await action({
    kind: 'click',
    window: 0,
    slot: destination,
    button: 0,
    mode: 0,
  });
  await until(async () => {
    const s = await snapshot();
    return s.inventory.slots[destination]?.count === 8 && !s.inventory.cursor;
  }, 'cursor stack moves to Minecraft inventory');
  results.checks.inventorySplitAndMove = true;
  await action({ kind: 'dig', target: [64, 231, 62] });
  await until(
    () => admin.blockAt(new Vec3(64, 231, 62))?.name === 'air',
    'Minecraft observer sees removal',
    15000,
  );
  results.checks.authoritativeBreaking = true;
  await action({ kind: 'place', target: [64, 229, 62], face: [0, 1, 0] });
  await until(
    () => admin.blockAt(new Vec3(64, 230, 62))?.name === 'stone',
    'Minecraft observer sees placement',
  );
  results.checks.authoritativePlacement = true;
  await action({ kind: 'dig', target: [1000, 230, 1000] });
  await until(async () => {
    const s = await snapshot();
    return s.actions.some((a) => a.kind === 'dig' && a.status === 'rejected');
  }, 'invalid target rejected');
  results.checks.invalidTargetRejected = true;
  await command(
    '/summon minecraft:pig 66 230 64 {NoAI:1b,PersistenceRequired:1b}',
  );
  await sleep(500);
  const pig = Object.values(admin.entities).find(
    (e) => e.name === 'pig' && e.position.distanceTo(new Vec3(66, 230, 64)) < 3,
  );
  assert.ok(pig, 'server pig exists');
  let pigHurt = false;
  admin.on('entityHurt', (entity) => {
    if (entity.id === pig.id) pigHurt = true;
  });
  await action({ kind: 'attack', entity: pig.id });
  await until(async () => {
    const s = await snapshot();
    return s.actions.some((a) => a.kind === 'attack' && a.status === 'sent');
  }, 'attack forwarded');
  results.checks.entityAttackForwarded = true;
  await until(() => pigHurt, 'authoritative pig hurt event');
  results.checks.entityAttackServerOutcome = true;
  const visible = await snapshot();
  assert.ok(visible.entities.some((e) => e.name === 'pig'));
  results.checks.entityReplication = true;
  await command(
    '/summon minecraft:item 67 230 65 {Item:{id:"minecraft:oak_log",count:3}}',
  );
  await until(async () => {
    const s = await snapshot();
    return s.entities.some((e) => e.item?.name === 'oak_log');
  }, 'dropped item metadata');
  results.checks.droppedItemVisual = await until(
    () =>
      lua(
        'local found=false for _,m in ipairs(workspace.MinecraftEntities:GetChildren()) do if m:GetAttribute("MinecraftItem")=="oak_log" and m:FindFirstChildOfClass("MeshPart") then found=true end end return game.HttpService:JSONEncode(found)',
      ),
    'actual dropped block geometry',
  );
  results.checks.blockViewportIcon = await lua(
    'local found=false for _,i in ipairs(game.Players.LocalPlayer.PlayerGui.MinecraftHUD:GetDescendants()) do if i:IsA("ViewportFrame") and i.Visible and i:FindFirstChildOfClass("Model") then found=true end end return game.HttpService:JSONEncode(found)',
  );
  assert.ok(
    results.checks.blockViewportIcon,
    'block inventory icons have textured viewport geometry',
  );
  await lua(
    'game.Players.LocalPlayer.PlayerGui.MinebloxDiagnostics:Invoke("look",{yaw=0,pitch=0}) return "true"',
  );
  const mover = () =>
    Object.values(admin.entities).find((e) => e.username === name);
  await until(() => mover(), 'real Roblox Minecraft entity');
  const origin = mover().position.clone();
  let firstObservedMs;
  const started = performance.now();
  const moved = (e) => {
    if (
      e.username === name &&
      e.position.distanceTo(origin) > 0.2 &&
      firstObservedMs === undefined
    )
      firstObservedMs = performance.now() - started;
  };
  admin.on('entityMoved', moved);
  await call('user_keyboard_input', {
    datamodel_type: 'Client',
    actions: [
      { action: 'keyDown', key_code: 'W' },
      { action: 'keyDown', key_code: 'Space' },
      { action: 'wait', wait_time_ms: 1000 },
      { action: 'keyUp', key_code: 'W' },
      { action: 'keyUp', key_code: 'Space' },
    ],
  });
  let settledError;
  await until(async () => {
    const s = await lua(
      'return game.HttpService:JSONEncode(game.Players.LocalPlayer:GetAttributes())',
    );
    const p = mover()?.position;
    if (!p) return false;
    settledError = Math.hypot(
      p.x - s.MinecraftX,
      p.y - s.MinecraftY,
      p.z - s.MinecraftZ,
    );
    return settledError < 0.15 && firstObservedMs !== undefined;
  }, 'settled client position agreement');
  admin.off('entityMoved', moved);
  const attrs = await lua(
    'return game.HttpService:JSONEncode(game.Players.LocalPlayer:GetAttributes())',
  );
  results.movement = {
    firstObservedMs,
    settledErrorBlocks: settledError,
    localCameraResponseMs: attrs.FirstCameraResponseMs,
    cameraMovedBeforeNextState: attrs.CameraMovedBeforeStateUpdate,
    cameraMovedBeforeInputAcknowledged:
      attrs.CameraMovedBeforeInputAcknowledged,
    distanceBlocks: mover().position.distanceTo(origin),
  };
  results.checks.keyboardMovement = true;
  assert.ok(
    results.movement.distanceBlocks > 1,
    'keyboard movement must cross the test platform',
  );
  assert.ok(
    results.movement.localCameraResponseMs < 100 &&
      results.movement.cameraMovedBeforeInputAcknowledged,
    'local movement must start before its input acknowledgement',
  );
  results.guiMinecraftConnected = Boolean(admin.players.MCGraphObserver);
  // A UI path is exercised too: open inventory and send text using official input.
  await call('user_keyboard_input', {
    datamodel_type: 'Client',
    actions: [
      { action: 'keyPress', key_code: 'E' },
      { action: 'wait', wait_time_ms: 300 },
    ],
  });
  results.checks.inventoryUiOpened = await lua(
    'local g=game.Players.LocalPlayer.PlayerGui.MinecraftHUD local n=0 for _,p in ipairs(g:GetDescendants()) do if p:IsA("TextButton") and p.Text=="Done" and p.Parent.Visible then n+=1 end end return game.HttpService:JSONEncode(n>0)',
  );
  await call('user_keyboard_input', {
    datamodel_type: 'Client',
    actions: [
      { action: 'keyPress', key_code: 'E' },
      { action: 'wait', wait_time_ms: 200 },
      { action: 'keyPress', key_code: 'T' },
      { action: 'wait', wait_time_ms: 200 },
      {
        action: 'textInput',
        text_inputs: 'Actual UI chat proof',
        instance_path: 'LocalPlayer.PlayerGui.MinecraftHUD.MinecraftChatInput',
      },
      { action: 'wait', wait_time_ms: 200 },
      {
        action: 'keyPress',
        key_code: 'Return',
        instance_path: 'LocalPlayer.PlayerGui.MinecraftHUD.MinecraftChatInput',
      },
    ],
  });
  await until(
    () => messages.some((m) => m.includes('Actual UI chat proof')),
    'actual chat UI',
  );
  results.checks.chatUi = true;
  results.checks.uiSoundLoaded = await until(
    () =>
      lua(
        'local s=game.SoundService:FindFirstChild("MinecraftSound_ui") return game.HttpService:JSONEncode(s~=nil and s.IsLoaded and s.TimeLength>0 and s.Volume>0)',
      ),
    'Creator Store UI sound loaded',
  );
  results.checks.crackOverlayCleared = await lua(
    'local hidden=true for _,label in ipairs(workspace.MinecraftSelection:GetDescendants()) do if label:IsA("ImageLabel") and label.Visible then hidden=false end end return game.HttpService:JSONEncode(hidden)',
  );
  assert.ok(
    results.checks.crackOverlayCleared,
    'idle block targets must have no stale crack overlay',
  );
  if (!process.argv.includes('--headless'))
    assert.ok(
      results.guiMinecraftConnected,
      'graphical Minecraft and Roblox must be connected simultaneously',
    );
  await writeFile(
    '.local/playable-smoke.json',
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  if (initial) {
    admin.chat(
      `/tp ${initial.minecraftName ?? `RB${initial.robloxId}`} ${initial.predicted.position.x} ${initial.predicted.position.y} ${initial.predicted.position.z}`,
    );
    await sleep(200);
  }
  admin.chat('/deop MinebloxAdmin');
  await sleep(200);
  admin.quit();
  await client.close();
}
