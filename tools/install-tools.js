import { mkdir, readFile, writeFile, access, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Official release assets, pinned versions and GitHub's SHA-256 asset digest.
const windows = process.platform === 'win32';
if (!windows && process.platform !== 'linux')
  throw new Error('Portable tool bootstrap supports Windows and Linux CI');
const suffix = windows ? '.exe' : '';
const packages = [
  [
    'rojo-rbx/rojo',
    'v7.7.1',
    windows ? 'rojo-7.7.1-windows-x86_64.zip' : 'rojo-7.7.1-linux-x86_64.zip',
    'rojo',
    `rojo${suffix}`,
  ],
  [
    'luau-lang/luau',
    '0.741',
    windows ? 'luau-windows.zip' : 'luau-ubuntu.zip',
    'luau',
    `luau-compile${suffix}`,
  ],
];
for (const [repo, tag, filename, directory, executable] of packages) {
  const target = path.resolve('.local/tools', directory);
  try {
    await access(path.join(target, executable));
    continue;
  } catch {
    /* Install missing tools. */
  }
  await mkdir(target, { recursive: true });
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases/tags/${tag}`,
    {
      headers: {
        'User-Agent': 'Mineblox',
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw new Error(`Release lookup failed: ${response.status}`);
  const asset = (await response.json()).assets.find((a) => a.name === filename);
  if (!asset?.digest?.startsWith('sha256:'))
    throw new Error('Missing official release integrity digest');
  const download = await fetch(asset.browser_download_url, {
    signal: AbortSignal.timeout(120000),
  });
  if (!download.ok) throw new Error(`Tool download failed: ${download.status}`);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (
    `sha256:${createHash('sha256').update(bytes).digest('hex')}` !==
    asset.digest
  )
    throw new Error('Tool integrity mismatch');
  const archive = path.join(target, 'download.zip');
  await writeFile(archive, bytes);
  if (windows)
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${target.replaceAll("'", "''")}' -Force`,
      ],
      { windowsHide: true },
    );
  else {
    execFileSync('unzip', ['-o', archive, '-d', target], { stdio: 'ignore' });
    await chmod(path.join(target, executable), 0o755);
  }
  await writeFile(
    path.join(target, 'release.json'),
    JSON.stringify({ repo, tag, digest: asset.digest }),
  );
  console.log(`Installed ${directory} ${tag}`);
}
// Sanity-check the installed executables, rather than treating a directory as success.
execFileSync(path.resolve(`.local/tools/rojo/rojo${suffix}`), ['--version'], {
  stdio: 'inherit',
});
await readFile(path.resolve(`.local/tools/luau/luau-compile${suffix}`));
