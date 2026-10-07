import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const client = new Client({ name: 'mineblox-playtest', version: '0.2.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('tools/mcp-proxy.js')],
  }),
);
const call = (name, args) =>
  client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
try {
  const action = process.argv[2] ?? 'inspect';
  let studioId;
  try {
    studioId = JSON.parse(await readFile('.local/studio.json', 'utf8')).id;
  } catch {
    /* Select the generated place below. */
  }
  if (!studioId || action === 'select') {
    const list = await call('list_roblox_studios', {});
    const studios = JSON.parse(
      list.content.find((c) => c.type === 'text').text,
    ).studios;
    const { generation } = JSON.parse(
      await readFile('.local/roblox/generation.json', 'utf8'),
    );
    for (const studio of studios.filter((s) => s.name === 'Mineblox.rbxlx')) {
      const result = await call('execute_luau', {
        studio_id: studio.id,
        datamodel_type: 'Edit',
        code: `local c = game.ServerScriptService:FindFirstChild("DevelopmentConfig") return c ~= nil and string.find(c.Source, ${JSON.stringify(generation)}, 1, true) ~= nil`,
      });
      console.log(studio.id, JSON.stringify(result));
      if (
        !result.isError &&
        result.content.some((c) => c.type === 'text' && /\btrue\b/.test(c.text))
      ) {
        studioId = studio.id;
        break;
      }
    }
    if (!studioId)
      throw new Error(
        'No generated Mineblox place has the current local gateway configuration',
      );
    await writeFile('.local/studio.json', JSON.stringify({ id: studioId }));
    if (action === 'select') process.exitCode = 0;
  }
  const args = { studio_id: studioId };
  let result;
  if (action === 'play' || action === 'stop')
    result = await call('start_stop_play', {
      ...args,
      is_start: action === 'play',
    });
  else if (action === 'state') result = await call('get_studio_state', args);
  else if (action === 'console')
    result = await call('get_console_output', args);
  else if (action === 'materials')
    result = await call('execute_luau', {
      ...args,
      datamodel_type: 'Client',
      code: 'local missing = {} local t = workspace:FindFirstChild("MinecraftTerrain") if t then for _, p in ipairs(t:GetChildren()) do for name in string.gmatch(p:GetAttribute("UntexturedMaterials") or "", "[^,]+") do missing[name] = true end end end local names = {} for name in pairs(missing) do table.insert(names, name) end table.sort(names) return game.HttpService:JSONEncode(names)',
    });
  else if (action === 'capture') {
    result = await call('screen_capture', {
      ...args,
      capture_id: 'MinebloxLive',
    });
    for (const item of result.content ?? [])
      if (item.type === 'image') {
        await writeFile(
          '.local/roblox/studio-screen.png',
          Buffer.from(item.data, 'base64'),
        );
        item.data = '[saved studio-screen.png]';
      }
  } else if (action === 'move')
    result = await call('user_keyboard_input', {
      ...args,
      datamodel_type: 'Client',
      actions: [
        { action: 'keyDown', key_code: 'W' },
        { action: 'wait', wait_time_ms: 2000 },
        { action: 'keyUp', key_code: 'W' },
      ],
    });
  else if (action === 'inspect')
    result = await call('execute_luau', {
      ...args,
      datamodel_type: 'Client',
      code: 'local p = game.Players.LocalPlayer local t = workspace:FindFirstChild("MinecraftTerrain") local n, meshes = 0, 0 if t then for _, i in ipairs(t:GetDescendants()) do if i:IsA("BasePart") then n += 1 end if i:IsA("MeshPart") then meshes += 1 end end end return game.HttpService:JSONEncode({player = p and p.Name, position = p and p:GetAttributes(), partitions = t and #t:GetChildren(), parts = n, meshParts = meshes, hud = p and p.PlayerGui:FindFirstChild("MinecraftHUD") ~= nil, camera = tostring(workspace.CurrentCamera.CFrame.Position)})',
    });
  if (result) console.log(JSON.stringify(result, null, 2));
} finally {
  await client.close();
}
