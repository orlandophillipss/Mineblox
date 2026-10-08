import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export function publicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Deployment URL must be a public HTTPS origin');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    url.port ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
    /(^|\.)localhost$/.test(url.hostname)
  )
    throw new Error('Deployment URL must be a public HTTPS origin');
  return url.origin;
}
export function quickTunnelUrl(text) {
  const match = String(text).match(
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i,
  );
  return match ? publicUrl(match[0]) : null;
}
export async function startTunnel(mode, origin) {
  if (!['quick', 'named'].includes(mode))
    throw new Error('Tunnel mode must be quick or named');
  const target = new URL(origin);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1')
    throw new Error('Tunnel origin must be loopback');
  const executable =
    process.env.MINEBLOX_CLOUDFLARED ??
    path.resolve(
      `.local/tools/cloudflared/cloudflared${process.platform === 'win32' ? '.exe' : ''}`,
    );
  await access(executable);
  const args = ['tunnel', '--no-autoupdate'];
  let url;
  if (mode === 'quick') args.push('--url', origin);
  else {
    url = publicUrl(process.env.MINEBLOX_PUBLIC_URL);
    if (process.env.MINEBLOX_TUNNEL_CONFIG_FILE) {
      const file = path.resolve(process.env.MINEBLOX_TUNNEL_CONFIG_FILE);
      await access(file);
      if (!/^[a-f0-9-]{36}$/i.test(process.env.MINEBLOX_TUNNEL_ID ?? ''))
        throw new Error('Invalid tunnel ID');
      args.push('--config', file, 'run', process.env.MINEBLOX_TUNNEL_ID);
    } else {
      const file = path.resolve(
        process.env.MINEBLOX_TUNNEL_TOKEN_FILE ??
          '.local/deployment/tunnel-token.txt',
      );
      const token = await readFile(file, 'utf8');
      if (token.trim().length < 20)
        throw new Error('Named tunnel token file is empty or invalid');
      args.push('run', '--token-file', file);
    }
  }
  const child = spawn(executable, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  if (url) {
    child.stdout.resume();
    child.stderr.resume();
    return { child, url };
  }
  try {
    url = await new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(
        () =>
          reject(
            new Error('Quick tunnel did not provide a URL within 45 seconds'),
          ),
        45000,
      );
      const onData = (data) => {
        buffer = (buffer + data.toString()).slice(-8192);
        const found = quickTunnelUrl(buffer);
        if (found) {
          clearTimeout(timer);
          resolve(found);
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Tunnel exited before becoming ready'));
      });
    });
    return { child, url };
  } catch (error) {
    child.kill();
    throw error;
  }
}
