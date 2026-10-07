import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const client = new Client({ name: 'mineblox-sync', version: '0.2.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('tools/mcp-proxy.js')],
  }),
);
try {
  const { id } = JSON.parse(await readFile('.local/studio.json', 'utf8'));
  const scripts = [
    ['ServerScriptService.BridgeTransport', 'roblox/BridgeTransport.luau'],
    ['ServerScriptService.MinebloxServer', 'roblox/Server.server.luau'],
    ['ReplicatedStorage.MinebloxClient.Renderer', 'roblox/Renderer.luau'],
    ['ReplicatedStorage.MinebloxClient.Images', 'roblox/Images.luau'],
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
  for (const [target, filename] of scripts) {
    const source = await readFile(filename, 'utf8');
    const result = await client.callTool({
      name: 'execute_luau',
      arguments: {
        studio_id: id,
        datamodel_type: 'Edit',
        code: `game.${target}.Source = ${JSON.stringify(source).replaceAll('\\r', '').replaceAll('\\t', '\\t')} return "Updated ${target}"`,
      },
    });
    if (result.isError) throw new Error(JSON.stringify(result));
    console.log(`Installed ${target}`);
  }
} finally {
  await client.close();
}
