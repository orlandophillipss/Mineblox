import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { publicUrl } from './tunnel.js';
import { validateContent, EMPTY_CONTENT } from '../bridge/content.js';

export async function buildPlace({
  url,
  token,
  published = false,
  content = EMPTY_CONTENT,
}) {
  if (published) {
    url = publicUrl(url);
    content = validateContent(content);
  }
  const generation = randomUUID();
  const root = path.resolve(published ? '.local/published' : '.local/roblox');
  await mkdir(root, { recursive: true });
  let audio = JSON.parse(await readFile('roblox/audio-defaults.json', 'utf8'));
  try {
    audio = JSON.parse(await readFile('.local/audio.json', 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (
    !audio.sounds ||
    typeof audio.sounds !== 'object' ||
    !Array.isArray(audio.music) ||
    audio.music.length > 32 ||
    Object.keys(audio.sounds).length > 32 ||
    [...Object.values(audio.sounds), ...audio.music].some(
      (id) => typeof id !== 'string' || !/^rbxassetid:\/\/\d{1,20}$/.test(id),
    )
  )
    throw new Error('Audio config requires permitted Roblox audio asset IDs');
  await writeFile(
    path.join(root, 'AudioConfig.luau'),
    `return game:GetService("HttpService"):JSONDecode(${JSON.stringify(JSON.stringify(audio))})\n`,
  );
  await writeFile(
    path.join(root, 'DevelopmentConfig.luau'),
    published
      ? `-- Published configuration: credentials are read from Roblox Secret MINEBLOX_TOKEN.\nreturn { url = ${JSON.stringify(url)}, published = true, generation = ${JSON.stringify(generation)} }\n`
      : `-- Private local development configuration. Never publish this place with this token.\nreturn { url = ${JSON.stringify(url)}, token = ${JSON.stringify(token)}, generation = ${JSON.stringify(generation)} }\n`,
  );
  await writeFile(
    path.join(root, 'generation.json'),
    JSON.stringify({ generation }),
  );
  const source = (filename) => ({ $path: path.resolve('roblox', filename) });
  let developmentAssets = {};
  if (published) {
    await writeFile(
      path.join(root, 'PublishedAssets.luau'),
      `return game:GetService("HttpService"):JSONDecode(${JSON.stringify(JSON.stringify(content))})\n`,
    );
    developmentAssets = {
      PublishedAssets: { $path: path.join(root, 'PublishedAssets.luau') },
    };
  } else
    try {
      await access(path.join(root, 'DevelopmentAssets.luau'));
      developmentAssets = {
        DevelopmentAssets: { $path: path.join(root, 'DevelopmentAssets.luau') },
      };
      for (const file of await readdir(root))
        if (/^Asset(?:Pixels|Models|Catalog)\d+\.luau$/.test(file))
          developmentAssets[file.replace('.luau', '')] = {
            $path: path.join(root, file),
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
          ItemVisual: source('ItemVisual.luau'),
          EntityVisual: source('EntityVisual.luau'),
          EntityDefinitions: source('EntityDefinitions.luau'),
          EntityLoad: source('EntityLoad.luau'),
          ViewportFit: source('ViewportFit.luau'),
          AudioConfig: { $path: path.join(root, 'AudioConfig.luau') },
          Font: source('Font.luau'),
          World: source('World.luau'),
          VoxelData: source('VoxelData.luau'),
          Prediction: source('Prediction.luau'),
          Placement: source('Placement.luau'),
          Inventory: source('Inventory.luau'),
          Atlas: source('Atlas.luau'),
          FaceTiles: source('FaceTiles.luau'),
          Sprint: source('Sprint.luau'),
          InputLatch: source('InputLatch.luau'),
          Metrics: source('Metrics.luau'),
          Interface: source('Interface.luau'),
          Visibility: source('Visibility.luau'),
          Sounds: source('Sounds.luau'),
          Sky: source('Sky.luau'),
          SkyAssets: source('SkyAssets.luau'),
          Interpolation: source('Interpolation.luau'),
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
    path.resolve(
      `.local/tools/rojo/rojo${process.platform === 'win32' ? '.exe' : ''}`,
    ),
    ['build', file, '-o', place],
    { stdio: 'inherit', windowsHide: true },
  );
  return place;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve('tools/build-place.js')
) {
  let config;
  if (process.argv.includes('--published')) {
    let content = EMPTY_CONTENT;
    try {
      content = JSON.parse(
        await readFile('.local/content/catalog.json', 'utf8'),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    config = {
      published: true,
      url: process.argv[process.argv.indexOf('--published') + 1],
      content,
    };
  } else config = JSON.parse(await readFile('.local/launcher.json', 'utf8'));
  console.log(await buildPlace(config));
}
