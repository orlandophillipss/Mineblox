import { spawnSync } from 'node:child_process';
if (process.argv[2] === 'java') {
  const result = spawnSync('java', ['-version'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  process.stdout.write(result.stderr ?? '');
} else console.log(process.versions.node);
