import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const client = new Client({ name: 'mineblox-launcher', version: '0.2.0' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('tools/mcp-proxy.js')],
    }),
  );
  const { url } = JSON.parse(await readFile('.local/launcher.json', 'utf8'));
  let selected;
  for (let attempt = 0; attempt < 20 && !selected; attempt++) {
    const tools = await client.listTools();
    if (!tools.tools.some((t) => t.name === 'list_roblox_studios')) break;
    const list = await client.callTool({
      name: 'list_roblox_studios',
      arguments: {},
    });
    const studios = JSON.parse(
      list.content.find((c) => c.type === 'text').text,
    ).studios;
    for (const studio of studios.filter((s) => s.name === 'Mineblox.rbxlx')) {
      const check = await client.callTool({
        name: 'execute_luau',
        arguments: {
          studio_id: studio.id,
          datamodel_type: 'Edit',
          code: `local c = game.ServerScriptService:FindFirstChild("DevelopmentConfig") return c ~= nil and string.find(c.Source, ${JSON.stringify(url)}, 1, true) ~= nil`,
        },
      });
      if (
        !check.isError &&
        check.content.some((c) => c.type === 'text' && c.text === 'true')
      ) {
        selected = studio.id;
        break;
      }
    }
    if (!selected) await sleep(1000);
  }
  if (!selected)
    throw new Error('Enable Studio as an MCP server or press Play manually');
  await writeFile('.local/studio.json', JSON.stringify({ id: selected }));
  const result = await client.callTool({
    name: 'start_stop_play',
    arguments: { studio_id: selected, is_start: true },
  });
  if (result.isError)
    throw new Error('Studio could not start Play automatically');
  console.log('Roblox playtest started automatically.');
} catch (error) {
  console.log(`Automatic Studio start: ${error.message}`);
} finally {
  await client.close();
}
