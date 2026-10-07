import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { access } from 'node:fs/promises';

export async function buildPlace({ url, token }) {
  const root = path.resolve('.local/roblox');
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, 'DevelopmentConfig.luau'),
    `-- Private local development configuration. Never publish this place with this token.\nreturn { url = ${JSON.stringify(url)}, token = ${JSON.stringify(token)} }\n`,
  );
  const source = (filename) => ({ $path: path.resolve('roblox', filename) });
  let developmentAssets = {};
  try {
    await access(path.join(root, 'DevelopmentAssets.luau'));
    developmentAssets = {
      DevelopmentAssets: { $path: path.join(root, 'DevelopmentAssets.luau') },
    };
  } catch {
    /* Substitute colors remain available. */
  }
  const project = {
    name: 'Mineblox',
    tree: {
      $className: 'DataModel',
      HttpService: {
        $className: 'HttpService',
        $properties: { HttpEnabled: true },
      },
      Workspace: { $className: 'Workspace', $properties: { Gravity: 0 } },
      Lighting: {
        $className: 'Lighting',
        $properties: {
          ClockTime: 14,
          Brightness: 2,
          Ambient: [0.4, 0.4, 0.4],
          OutdoorAmbient: [0.4, 0.4, 0.4],
        },
      },
      Players: {
        $className: 'Players',
        $properties: { CharacterAutoLoads: false },
      },
      ServerScriptService: {
        $className: 'ServerScriptService',
        BridgeTransport: source('BridgeTransport.luau'),
        MinebloxServer: source('Server.server.luau'),
        DevelopmentConfig: { $path: path.join(root, 'DevelopmentConfig.luau') },
      },
      ReplicatedStorage: {
        $className: 'ReplicatedStorage',
        MinebloxClient: {
          $className: 'Folder',
          Renderer: source('Renderer.luau'),
          Images: source('Images.luau'),
          ...developmentAssets,
          Hud: source('Hud.luau'),
        },
      },
      StarterPlayer: {
        $className: 'StarterPlayer',
        StarterPlayerScripts: {
          $className: 'StarterPlayerScripts',
          MinebloxClient: source('Client.client.luau'),
        },
      },
    },
  };
  const file = path.join(root, 'default.project.json');
  await writeFile(file, JSON.stringify(project, null, 2));
  const place = path.join(root, 'Mineblox.rbxlx');
  execFileSync(
    path.resolve('.local/tools/rojo/rojo.exe'),
    ['build', file, '-o', place],
    { stdio: 'inherit', windowsHide: true },
  );
  return place;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve('tools/build-place.js')
) {
  const config = JSON.parse(await readFile('.local/launcher.json', 'utf8'));
  console.log(await buildPlace(config));
}
