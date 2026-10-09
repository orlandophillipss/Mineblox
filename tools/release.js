import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version))
  throw new Error('Invalid release version');
const output = path.resolve('.local/releases');
await mkdir(output, { recursive: true });
const git = (args) =>
  execFileSync(
    'git',
    ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, ...args],
    { encoding: 'utf8', windowsHide: true },
  );
if (git(['status', '--porcelain']).trim())
  throw new Error('Commit all changes before producing a reproducible release');
const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
const allowed = files.filter(
  (file) => !file.startsWith('.github/') && file !== 'AGENTS.md',
);
if (
  allowed.some(
    (file) =>
      /(^|\/)(\.local|node_modules|\.git|\.env)(\/|$)/.test(file) ||
      /\.(jar|rbxlx?|png|ogg|mp3|wav)$/i.test(file),
  )
)
  throw new Error('Release contains private state or game binaries/assets');
const commit = git(['rev-parse', 'HEAD']).trim();
const hashes = [];
for (const flavor of ['windows', 'server']) {
  const filename = `Mineblox-${version}-${flavor}.zip`;
  const archive = path.join(output, filename);
  const selected =
    flavor === 'windows'
      ? allowed
      : allowed.filter(
          (file) => !file.endsWith('.bat') && !file.endsWith('.ps1'),
        );
  git([
    'archive',
    '--format=zip',
    `--prefix=Mineblox-${version}/`,
    `--output=${archive}`,
    'HEAD',
    '--',
    ...selected,
  ]);
  const bytes = await readFile(archive);
  hashes.push(
    `${createHash('sha256').update(bytes).digest('hex')}  ${filename}`,
  );
  console.log(archive);
}
await writeFile(path.join(output, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
await writeFile(
  path.join(output, 'release.json'),
  JSON.stringify(
    {
      version,
      commit,
      minecraft: '1.21.4',
      node: 24,
      protocol: 1,
      contentFormat: 2,
      compatibleContentFormats: [1, 2],
      terrainFormats: ['state-u32-xzy-v1', 'state-adaptive-xzy-v2'],
      channel: version.includes('-') ? 'prerelease' : 'stable',
      artifacts: hashes.map((line) => line.split('  ')[1]),
    },
    null,
    2,
  ),
);
