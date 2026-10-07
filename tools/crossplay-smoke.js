import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import mineflayer from 'mineflayer';

const client = new Client({
  name: 'mineblox-crossplay-test',
  version: '0.2.0',
});
const { id: studioId } = JSON.parse(
  await readFile('.local/studio.json', 'utf8'),
);
let observer;
const call = (name, args) =>
  client.callTool(
    { name, arguments: { studio_id: studioId, ...args } },
    undefined,
    { timeout: 120000 },
  );
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function inspect() {
  const result = await call('execute_luau', {
    datamodel_type: 'Client',
    code: 'local p = game.Players.LocalPlayer local s=p.PlayerGui.MinebloxDiagnostics:Invoke("snapshot") local t = workspace:FindFirstChild("MinecraftTerrain") local meshes, parts, textured = 0, 0, 0 if t then for _, i in ipairs(t:GetDescendants()) do if i:IsA("BasePart") then parts += 1 end if i:IsA("MeshPart") then meshes += 1 if i.TextureContent.SourceType ~= Enum.ContentSourceType.None or i:FindFirstChildOfClass("SurfaceAppearance") then textured += 1 end end end end return game.HttpService:JSONEncode({ minecraftName=s and s.minecraftName, userId = p.UserId, attributes = p:GetAttributes(), meshes = meshes, parts = parts, textured = textured, partitions = t and #t:GetChildren(), hud = p.PlayerGui:FindFirstChild("MinecraftHUD") ~= nil })',
  });
  if (result.isError) throw new Error(JSON.stringify(result));
  return JSON.parse(result.content.find((c) => c.type === 'text').text);
}
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('tools/mcp-proxy.js')],
    }),
  );
  const initial = await inspect();
  assert.ok(
    initial.hud && initial.meshes > 0 && initial.textured > 0,
    'Real textured terrain and HUD must be present',
  );
  observer = mineflayer.createBot({
    host: '127.0.0.1',
    port: 25565,
    username: 'BridgeObserver',
    auth: 'offline',
    version: '1.21.4',
    viewDistance: 'tiny',
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Minecraft observer spawn timeout')),
      15000,
    );
    observer.once('spawn', () => {
      clearTimeout(timer);
      resolve();
    });
    observer.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  const name =
    initial.minecraftName ??
    `RB${initial.userId <= 0 ? 200000000000 + Math.abs(initial.userId) : initial.userId}`;
  const find = () =>
    Object.values(observer.entities).find((e) => e.username === name);
  for (let i = 0; i < 100 && !find(); i++) await sleep(50);
  assert.ok(
    find(),
    'Separate Minecraft client must receive the Roblox user as a real player',
  );
  const origin = find().position.clone();
  let firstObservedMs = null;
  const started = performance.now();
  const listener = (entity) => {
    if (
      entity.username === name &&
      entity.position.distanceTo(origin) > 0.2 &&
      firstObservedMs === null
    )
      firstObservedMs = performance.now() - started;
  };
  observer.on('entityMoved', listener);
  const movement = await call('user_keyboard_input', {
    datamodel_type: 'Client',
    actions: [
      { action: 'keyDown', key_code: 'W' },
      { action: 'keyDown', key_code: 'Space' },
      { action: 'wait', wait_time_ms: 2000 },
      { action: 'keyUp', key_code: 'W' },
      { action: 'keyUp', key_code: 'Space' },
    ],
  });
  if (movement.isError) throw new Error(JSON.stringify(movement));
  await sleep(1200);
  const final = await inspect();
  const entity = find();
  assert.ok(
    entity && firstObservedMs !== null,
    'Roblox keyboard input must move the Minecraft protocol player',
  );
  const a = final.attributes;
  const error = Math.hypot(
    entity.position.x - a.MinecraftX,
    entity.position.y - a.MinecraftY,
    entity.position.z - a.MinecraftZ,
  );
  assert.ok(error < 0.15, `Settled client positions differ by ${error} blocks`);
  const report = {
    date: new Date().toISOString(),
    minecraftVersion: '1.21.4',
    observedPlayer: name,
    firstObservedMovementMs: firstObservedMs,
    localCameraResponseMs: a.FirstCameraResponseMs,
    cameraMovedBeforeNextState: a.CameraMovedBeforeStateUpdate,
    nativeObserved: {
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
    },
    robloxDisplayed: { x: a.MinecraftX, y: a.MinecraftY, z: a.MinecraftZ },
    settledPositionErrorBlocks: error,
    distanceMovedBlocks: entity.position.distanceTo(origin),
    hud: final.hud,
    health: a.MinecraftHealth,
    hunger: a.MinecraftHunger,
    terrainPartitions: final.partitions,
    meshParts: final.meshes,
    texturedMeshParts: final.textured,
    note: 'Real Roblox Studio keyboard input and a separate Minecraft protocol observer; one sample, not zero-latency parity or a native GUI client test.',
  };
  await writeFile(
    '.local/crossplay-smoke.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  observer?.quit();
  await client.close();
}
