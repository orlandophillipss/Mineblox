import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const client = new Client({ name: 'mineblox-profile', version: '0.2.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('tools/mcp-proxy.js')],
  }),
);
try {
  const { id } = JSON.parse(await readFile('.local/studio.json', 'utf8'));
  const modes = process.argv.includes('--paired')
    ? [false, true, false]
    : [null];
  const records = [];
  for (const culling of modes) {
    const result = await client.callTool(
      {
        name: 'execute_luau',
        arguments: {
          studio_id: id,
          datamodel_type: 'Client',
          code: `local player=game.Players.LocalPlayer local d=player.PlayerGui.MinebloxDiagnostics ${culling === null ? '' : `d:Invoke("culling",${culling}) task.wait(1)`} local bytes=player:GetAttribute("HttpResponseBytes") or 0 local requests=player:GetAttribute("HttpRequests") or 0 local frames = {} local start = os.clock() while os.clock() - start < 5 do table.insert(frames, game.RunService.RenderStepped:Wait()*1000) end local elapsed=os.clock()-start table.sort(frames) local t = workspace:FindFirstChild("MinecraftTerrain") local meshes, parts = 0, 0 if t then for _, p in ipairs(t:GetDescendants()) do if p:IsA("BasePart") then parts += 1 end if p:IsA("MeshPart") then meshes += 1 end end end return game.HttpService:JSONEncode({frameMsP50=frames[math.ceil(#frames*.5)],frameMsP95=frames[math.ceil(#frames*.95)],sampleFrames=#frames,meshParts=meshes,terrainParts=parts,partitions=t and #t:GetChildren(),cached=d:Invoke("counts"),camera=tostring(workspace.CurrentCamera.CFrame),responseBytesPerSecond=((player:GetAttribute("HttpResponseBytes") or 0)-bytes)/elapsed,requestsPerSecond=((player:GetAttribute("HttpRequests") or 0)-requests)/elapsed,instances=#game:GetDescendants(),memoryMb=game.Stats:GetTotalMemoryUsageMb(),attributes=player:GetAttributes()})`,
        },
      },
      undefined,
      { timeout: 30000 },
    );
    if (result.isError) throw new Error(JSON.stringify(result));
    const data = JSON.parse(result.content.find((c) => c.type === 'text').text);
    const record = {
      date: new Date().toISOString(),
      label: process.argv[2] ?? 'baseline',
      culling,
      ...data,
      note: 'Five-second stationary Studio sample; Studio includes editor/plugin overhead. Not mobile FPS or a network-latency distribution.',
    };
    records.push(record);
  }
  if (modes.length > 1)
    await client.callTool({
      name: 'execute_luau',
      arguments: {
        studio_id: id,
        datamodel_type: 'Client',
        code: 'game.Players.LocalPlayer.PlayerGui.MinebloxDiagnostics:Invoke("culling",true)',
      },
    });
  const record =
    records.length === 1
      ? records[0]
      : {
          date: new Date().toISOString(),
          label: process.argv[2],
          samples: records,
        };
  await writeFile(
    `.local/profile-${record.label}.json`,
    JSON.stringify(record, null, 2),
  );
  console.log(JSON.stringify(record, null, 2));
} finally {
  await client.close();
}
