import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { selectStudio } from './studio-selection.js';
const client = new Client({ name: 'mineblox-sync', version: '0.2.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('tools/mcp-proxy.js')],
  }),
);
try {
  let previous;
  try {
    previous = JSON.parse(await readFile('.local/studio.json', 'utf8')).id;
  } catch {
    /* First connection. */
  }
  const list = await client.callTool({
    name: 'list_roblox_studios',
    arguments: {},
  });
  if (list.isError) throw new Error('Studio connection inventory failed');
  const id = selectStudio(
    JSON.parse(list.content.find((item) => item.type === 'text').text).studios,
    previous,
  );
  const stop = await client.callTool({
    name: 'start_stop_play',
    arguments: { studio_id: id, is_start: false },
  });
  if (stop.isError)
    throw new Error(
      'Could not stop the selected Studio playtest for script updates',
    );
  await writeFile('.local/studio.json', JSON.stringify({ id }));
  const scripts = [
    [
      'ServerScriptService.DevelopmentConfig',
      '.local/roblox/DevelopmentConfig.luau',
    ],
    ['ServerScriptService.BridgeTransport', 'roblox/BridgeTransport.luau'],
    ['ServerScriptService.MinebloxServer', 'roblox/Server.server.luau'],
    ['ReplicatedStorage.MinebloxClient.Renderer', 'roblox/Renderer.luau'],
    ['ReplicatedStorage.MinebloxClient.Atlas', 'roblox/Atlas.luau'],
    ['ReplicatedStorage.MinebloxClient.FaceTiles', 'roblox/FaceTiles.luau'],
    ['ReplicatedStorage.MinebloxClient.Sprint', 'roblox/Sprint.luau'],
    ['ReplicatedStorage.MinebloxClient.InputLatch', 'roblox/InputLatch.luau'],
    ['ReplicatedStorage.MinebloxClient.Metrics', 'roblox/Metrics.luau'],
    ['ReplicatedStorage.MinebloxClient.Images', 'roblox/Images.luau'],
    ['ReplicatedStorage.MinebloxClient.ItemVisual', 'roblox/ItemVisual.luau'],
    [
      'ReplicatedStorage.MinebloxClient.EntityVisual',
      'roblox/EntityVisual.luau',
    ],
    [
      'ReplicatedStorage.MinebloxClient.AudioConfig',
      '.local/roblox/AudioConfig.luau',
    ],
    ['ReplicatedStorage.MinebloxClient.Font', 'roblox/Font.luau'],
    ['ReplicatedStorage.MinebloxClient.World', 'roblox/World.luau'],
    ['ReplicatedStorage.MinebloxClient.VoxelData', 'roblox/VoxelData.luau'],
    ['ReplicatedStorage.MinebloxClient.Prediction', 'roblox/Prediction.luau'],
    ['ReplicatedStorage.MinebloxClient.Placement', 'roblox/Placement.luau'],
    ['ReplicatedStorage.MinebloxClient.Inventory', 'roblox/Inventory.luau'],
    ['ReplicatedStorage.MinebloxClient.Interface', 'roblox/Interface.luau'],
    ['ReplicatedStorage.MinebloxClient.Visibility', 'roblox/Visibility.luau'],
    ['ReplicatedStorage.MinebloxClient.Sounds', 'roblox/Sounds.luau'],
    ['ReplicatedStorage.MinebloxClient.Sky', 'roblox/Sky.luau'],
    ['ReplicatedStorage.MinebloxClient.SkyAssets', 'roblox/SkyAssets.luau'],
    [
      'ReplicatedStorage.MinebloxClient.Interpolation',
      'roblox/Interpolation.luau',
    ],
    [
      'ReplicatedStorage.MinebloxClient.DevelopmentAssets',
      '.local/roblox/DevelopmentAssets.luau',
    ],
    ['ReplicatedStorage.MinebloxClient.Hud', 'roblox/Hud.luau'],
    [
      'StarterPlayer.StarterPlayerScripts.MinebloxClient',
      'roblox/Client.client.luau',
    ],
  ];
  for (const file of await readdir('.local/roblox'))
    if (/^Asset(?:Pixels|Models|Catalog)\d+\.luau$/.test(file))
      scripts.unshift([
        `ReplicatedStorage.MinebloxClient.${file.replace('.luau', '')}`,
        `.local/roblox/${file}`,
      ]);
  for (const [target, filename] of scripts) {
    const source = await readFile(filename, 'utf8');
    const result = await client.callTool({
      name: 'execute_luau',
      arguments: {
        studio_id: id,
        datamodel_type: 'Edit',
        code: `local parent = game.${target.split('.').slice(0, -1).join('.')} local name = ${JSON.stringify(target.split('.').at(-1))} local s = parent:FindFirstChild(name) if not s then s = Instance.new("ModuleScript") s.Name = name s.Parent = parent end s.Source = ${JSON.stringify(source).replaceAll('\\r', '')} return "Updated ${target}"`,
      },
    });
    if (result.isError) throw new Error(JSON.stringify(result));
    console.log(`Installed ${target}`);
  }
} finally {
  await client.close();
}
