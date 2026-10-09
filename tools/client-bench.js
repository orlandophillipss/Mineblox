// Studio-only presentation measurements. No gameplay state is injected.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const mode = process.argv[2] ?? 'stationary';
if (!['stationary', 'walk', 'sprint', 'jump'].includes(mode))
  throw new Error('Choose stationary, walk, sprint or jump');
const studioId = JSON.parse(await readFile('.local/studio.json', 'utf8')).id;
const client = new Client({
  name: 'mineblox-frame-benchmark',
  version: '0.2.0',
});
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('tools/mcp-proxy.js')],
  }),
);
const call = async (name, args) => {
  const r = await client.callTool(
    { name, arguments: { studio_id: studioId, ...args } },
    undefined,
    { timeout: 120000 },
  );
  if (r.isError)
    throw new Error(
      r.content.find((c) => c.type === 'text')?.text ?? 'Studio test failed',
    );
  return r;
};
const execute = (code) =>
  call('execute_luau', { datamodel_type: 'Client', code });
const keyboard = (actions) =>
  call('user_keyboard_input', { datamodel_type: 'Client', actions });
try {
  await execute(`if _G.MinebloxBenchmarkConnection then _G.MinebloxBenchmarkConnection:Disconnect() end
    _G.MinebloxBenchmarkRows={} local start=os.clock()
    _G.MinebloxBenchmarkConnection=game.RunService.RenderStepped:Connect(function(dt)
      local d=game.Players.LocalPlayer.PlayerGui:FindFirstChild('MinebloxDiagnostics') if not d then return end
      local s=d:Invoke('snapshot') if not s then return end
      local p=workspace.CurrentCamera.CFrame.Position/4
      if #_G.MinebloxBenchmarkRows<2400 then table.insert(_G.MinebloxBenchmarkRows,{t=os.clock()-start,dt=dt,x=p.X,y=p.Y,z=p.Z,bridgeZ=s.predicted.position.z,error=game.Players.LocalPlayer:GetAttribute('ReconciliationBlocks') or 0,fov=workspace.CurrentCamera.FieldOfView}) end
    end) return 'Recording'`);
  const actions = [];
  if (mode === 'sprint')
    actions.push({ action: 'keyDown', key_code: 'LeftControl' });
  if (['walk', 'sprint'].includes(mode))
    actions.push({ action: 'keyDown', key_code: 'W' });
  if (mode === 'jump')
    actions.push(
      { action: 'keyDown', key_code: 'Space' },
      { action: 'wait', wait_time_ms: 120 },
      { action: 'keyUp', key_code: 'Space' },
    );
  actions.push({ action: 'wait', wait_time_ms: 5000 });
  if (mode !== 'stationary') actions.push({ action: 'keyUp', key_code: 'W' });
  if (mode === 'sprint')
    actions.push({ action: 'keyUp', key_code: 'LeftControl' });
  await keyboard(actions);
  const result = await execute(`_G.MinebloxBenchmarkConnection:Disconnect()
    local rows=_G.MinebloxBenchmarkRows local previous=rows[1] local forward,backwards,sum,maximum=0,0,0,0
    for _,r in ipairs(rows) do local speed=(previous.z-r.z)/math.max(r.dt,.001)
      if speed>.2 then forward+=1 sum+=speed maximum=math.max(maximum,speed) elseif speed<-.2 then backwards+=1 end previous=r
    end
    local floor=rows[1].y local peak,apex,airStart,land=floor,nil,nil,nil
    for _,r in ipairs(rows) do if r.y>peak then peak=r.y apex=r.t end if r.y>floor+.01 and not airStart then airStart=r.t end if airStart and r.y<=floor+.01 and not land then land=r.t end end
    return game.HttpService:JSONEncode({benchmark=game.Players.LocalPlayer.PlayerGui.MinebloxDiagnostics:Invoke('benchmark'),motion={samples=#rows,movingFrames=forward,backwardsFrames=backwards,meanForwardBlocksPerSecond=sum/math.max(forward,1),maximumBlocksPerSecond=maximum,first=rows[1],last=rows[#rows],jumpHeight=peak-floor,apexSeconds=apex and airStart and apex-airStart,airborneSeconds=land and airStart and land-airStart}})`);
  const report = JSON.parse(result.content.find((c) => c.type === 'text').text);
  report.rows = [];
  for (let start = 1; start <= report.motion.samples; start += 160) {
    const chunk = await execute(
      `local chunk={} for i=${start},math.min(${start + 159},#_G.MinebloxBenchmarkRows) do table.insert(chunk,_G.MinebloxBenchmarkRows[i]) end return game.HttpService:JSONEncode(chunk)`,
    );
    report.rows.push(
      ...JSON.parse(chunk.content.find((c) => c.type === 'text').text),
    );
  }
  const output = path.resolve('.local', `client-bench-${mode}.json`);
  await writeFile(
    output,
    JSON.stringify(
      { mode, measuredAt: new Date().toISOString(), ...report },
      null,
      2,
    ),
  );
  if (report.benchmark.degraded > 0)
    throw new Error(
      `Renderer has ${report.benchmark.degraded} degraded partitions; the saved measurement is not a successful rendering benchmark`,
    );
  if (mode === 'jump' && report.motion.jumpHeight < 0.5)
    throw new Error(
      'Jump did not execute; close inventory/chat and repeat the controlled test',
    );
  console.log(
    JSON.stringify(
      { output, benchmark: report.benchmark, motion: report.motion },
      null,
      2,
    ),
  );
} finally {
  try {
    await keyboard([
      { action: 'keyUp', key_code: 'W' },
      { action: 'keyUp', key_code: 'LeftControl' },
      { action: 'keyUp', key_code: 'Space' },
    ]);
  } catch {
    /* Preserve the original test error. */
  }
  await client.close();
}
