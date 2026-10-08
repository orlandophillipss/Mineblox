import { mkdir, writeFile, access, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64')
  throw new Error(
    'Portable tunnel installation currently supports Windows/Linux x64',
  );
const root = path.resolve('.local/tools/cloudflared');
await mkdir(root, { recursive: true });
const filename =
  process.platform === 'win32'
    ? 'cloudflared-windows-amd64.exe'
    : 'cloudflared-linux-amd64';
const executable = path.join(
  root,
  process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared',
);
let missing = false;
try {
  await access(executable);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  missing = true;
}
if (missing) {
  const response = await fetch(
    'https://api.github.com/repos/cloudflare/cloudflared/releases/latest',
    {
      headers: {
        'User-Agent': 'Mineblox',
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw new Error(`Tunnel release lookup HTTP ${response.status}`);
  const release = await response.json();
  const asset = release.assets.find((asset) => asset.name === filename);
  if (!asset?.digest?.startsWith('sha256:'))
    throw new Error('Official tunnel release is missing a SHA-256 digest');
  const download = await fetch(asset.browser_download_url, {
    signal: AbortSignal.timeout(120000),
  });
  if (!download.ok) throw new Error(`Tunnel download HTTP ${download.status}`);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (
    `sha256:${createHash('sha256').update(bytes).digest('hex')}` !==
    asset.digest
  )
    throw new Error('Tunnel download integrity mismatch');
  await writeFile(executable, bytes, { mode: 0o700 });
  if (process.platform === 'linux') await chmod(executable, 0o700);
  await writeFile(
    path.join(root, 'release.json'),
    JSON.stringify({ tag: release.tag_name, digest: asset.digest }),
  );
}
execFileSync(executable, ['--version'], {
  stdio: 'inherit',
  windowsHide: true,
});
