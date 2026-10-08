import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { publicUrl } from './tunnel.js';

const identifier = /^[a-f0-9]{32}$/i;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function hostingPlan(url, origin, { account, zone } = {}) {
  url = publicUrl(url);
  const target = new URL(origin);
  if (
    target.protocol !== 'http:' ||
    target.hostname !== '127.0.0.1' ||
    !target.port ||
    target.port === '25565' ||
    target.pathname !== '/' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new Error(
      'Hosting origin must be the loopback HTTP gateway, never Minecraft port 25565',
    );
  if (
    (account !== undefined && !identifier.test(account)) ||
    (zone !== undefined && !identifier.test(zone))
  )
    throw new Error(
      'Cloudflare account and zone IDs must contain 32 hexadecimal characters',
    );
  const hostname = new URL(url).hostname;
  return {
    url,
    hostname,
    origin: target.origin,
    account,
    zone,
    name: `mineblox-${hostname}`.slice(0, 100),
    changes: [
      'Create a dedicated Mineblox tunnel',
      'Add one proxied CNAME for the chosen hostname',
      'Route that hostname to the local HTTP gateway',
    ],
  };
}
export async function cloudflareRequest(
  token,
  route,
  method = 'GET',
  body,
  fetcher = fetch,
) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(token))
    throw new Error('Use a scoped Cloudflare API token from a private file');
  if (!/^\/(accounts|zones)\//.test(route))
    throw new Error('Unsupported Cloudflare API route');
  const response = await fetcher(
    'https://api.cloudflare.com/client/v4' + route,
    {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const bytes = await response.text();
  if (Buffer.byteLength(bytes) > 65536)
    throw new Error('Cloudflare response exceeds 64 KiB');
  let result;
  try {
    result = JSON.parse(bytes);
  } catch {
    throw new Error('Cloudflare returned an invalid response');
  }
  if (!response.ok || result.success !== true)
    throw new Error(
      `Cloudflare request failed (HTTP ${response.status}); check token permissions and account/zone IDs`,
    );
  return result.result;
}
// Existing DNS is inspected before any mutations. Only a tunnel recorded by
// this installation may be resumed; never overwrite somebody else's DNS.
export async function provisionCloudflare(
  plan,
  request,
  { existing, checkpoint = async () => {} } = {},
) {
  if (!identifier.test(plan.account) || !identifier.test(plan.zone))
    throw new Error('Provide the account and zone IDs');
  const zone = await request(`/zones/${plan.zone}`);
  if (
    zone.account?.id !== plan.account ||
    !(plan.hostname === zone.name || plan.hostname.endsWith('.' + zone.name))
  )
    throw new Error(
      'Hostname must belong to the selected Cloudflare account and zone',
    );
  const records = await request(
    `/zones/${plan.zone}/dns_records?name=${encodeURIComponent(plan.hostname)}&per_page=100`,
  );
  if (!Array.isArray(records)) throw new Error('Invalid DNS response');
  let tunnelId;
  if (
    existing &&
    existing.account === plan.account &&
    existing.zone === plan.zone &&
    existing.url === plan.url &&
    uuid.test(existing.tunnelId)
  ) {
    tunnelId = existing.tunnelId;
    const tunnel = await request(
      `/accounts/${plan.account}/cfd_tunnel/${tunnelId}`,
    );
    if (
      tunnel.deleted_at ||
      tunnel.name !== plan.name ||
      tunnel.config_src !== 'cloudflare'
    )
      throw new Error('Saved tunnel no longer matches this installation');
  }
  const content = tunnelId && `${tunnelId}.cfargotunnel.com`;
  if (
    records.length &&
    !(
      records.length === 1 &&
      records[0].type === 'CNAME' &&
      records[0].content === content &&
      records[0].proxied === true
    )
  )
    throw new Error(
      'Hostname already has DNS records; choose an unused hostname',
    );
  if (!tunnelId) {
    const tunnel = await request(
      `/accounts/${plan.account}/cfd_tunnel`,
      'POST',
      { name: plan.name, config_src: 'cloudflare' },
    );
    if (!uuid.test(tunnel.id))
      throw new Error('Cloudflare returned an invalid tunnel ID');
    tunnelId = tunnel.id;
    await checkpoint({
      account: plan.account,
      zone: plan.zone,
      url: plan.url,
      tunnelId,
    });
  }
  await request(
    `/accounts/${plan.account}/cfd_tunnel/${tunnelId}/configurations`,
    'PUT',
    {
      config: {
        ingress: [
          { hostname: plan.hostname, service: plan.origin },
          { service: 'http_status:404' },
        ],
      },
    },
  );
  if (!records.length)
    await request(`/zones/${plan.zone}/dns_records`, 'POST', {
      type: 'CNAME',
      name: plan.hostname,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      ttl: 1,
    });
  const token = await request(
    `/accounts/${plan.account}/cfd_tunnel/${tunnelId}/token`,
  );
  if (
    typeof token !== 'string' ||
    token.length < 20 ||
    token.length > 4096 ||
    /\s/.test(token)
  )
    throw new Error('Cloudflare returned an invalid connector token');
  return { tunnelId, token };
}
const root = path.resolve('.local/deployment');
export async function deploymentOrigin() {
  try {
    const config = JSON.parse(await readFile('.local/launcher.json', 'utf8'));
    return config.url;
  } catch (error) {
    if (error.code === 'ENOENT')
      throw new Error(
        'Launch the server profile once and stop it before configuring hosting',
        { cause: error },
      );
    throw error;
  }
}
async function privateJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  }
}
export async function setupCloudflareApi(
  url,
  { account, zone, apiTokenFile, apply = false } = {},
) {
  const plan = hostingPlan(url, await deploymentOrigin(), { account, zone });
  if (!apply) return plan;
  if (!apiTokenFile)
    throw new Error(
      'Provide --api-token-file; never put the token in arguments',
    );
  const apiToken = (await readFile(path.resolve(apiTokenFile), 'utf8')).trim();
  await mkdir(root, { recursive: true });
  const recordFile = path.join(root, 'cloudflare.json');
  const result = await provisionCloudflare(
    plan,
    (...args) => cloudflareRequest(apiToken, ...args),
    {
      existing: await privateJson(recordFile),
      checkpoint: (value) =>
        writeFile(recordFile, JSON.stringify(value, null, 2), { mode: 0o600 }),
    },
  );
  const tokenFile = path.join(root, 'tunnel-token.txt');
  await writeFile(tokenFile, result.token, { mode: 0o600 });
  await writeFile(
    path.join(root, 'settings.json'),
    JSON.stringify(
      { url: plan.url, tokenFile, provider: 'cloudflare-api' },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return { url: plan.url, tunnelId: result.tunnelId, profile: 'named' };
}
function executable() {
  return (
    process.env.MINEBLOX_CLOUDFLARED ??
    path.resolve(
      `.local/tools/cloudflared/cloudflared${process.platform === 'win32' ? '.exe' : ''}`,
    )
  );
}
export function cloudflareLogin() {
  // Authorization is completed by the operator in Cloudflare's own browser UI.
  execFileSync(executable(), ['tunnel', 'login'], {
    stdio: 'inherit',
    windowsHide: true,
  });
}
export async function setupCloudflareBrowser(url, { apply = false } = {}) {
  const plan = hostingPlan(url, await deploymentOrigin());
  if (!apply) return plan;
  await mkdir(root, { recursive: true });
  const credentials = path.join(root, 'browser-tunnel.json');
  let saved = await privateJson(credentials);
  if (!saved) {
    try {
      execFileSync(
        executable(),
        ['tunnel', 'create', '--credentials-file', credentials, plan.name],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
    } catch {
      throw new Error(
        'Tunnel creation failed. Run deploy cloudflare-login, authorize your domain and retry.',
      );
    }
    saved = await privateJson(credentials);
  }
  if (!uuid.test(saved?.TunnelID))
    throw new Error('Invalid Cloudflare tunnel credentials');
  const record = await privateJson(path.join(root, 'browser-hostname.json'));
  if (record && record.url !== plan.url)
    throw new Error('This browser tunnel already belongs to another hostname');
  try {
    execFileSync(
      executable(),
      ['tunnel', 'route', 'dns', saved.TunnelID, plan.hostname],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
  } catch {
    throw new Error(
      'DNS routing failed. Choose an unused hostname in the authorized domain; existing records are not overwritten.',
    );
  }
  await writeFile(
    path.join(root, 'browser-hostname.json'),
    JSON.stringify({ url: plan.url, tunnelId: saved.TunnelID }),
    { mode: 0o600 },
  );
  const configFile = path.join(root, 'cloudflared.yml');
  await writeFile(
    configFile,
    `tunnel: ${saved.TunnelID}\ncredentials-file: ${JSON.stringify(credentials)}\ningress:\n  - hostname: ${plan.hostname}\n    service: ${plan.origin}\n  - service: http_status:404\n`,
    { mode: 0o600 },
  );
  await writeFile(
    path.join(root, 'settings.json'),
    JSON.stringify(
      {
        url: plan.url,
        configFile,
        tunnelId: saved.TunnelID,
        provider: 'cloudflare-browser',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return { url: plan.url, tunnelId: saved.TunnelID, profile: 'named' };
}
export async function setupReverseProxy(url) {
  const plan = hostingPlan(url, await deploymentOrigin());
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'Caddyfile');
  await writeFile(
    file,
    `${plan.hostname} {\n  reverse_proxy ${plan.origin}\n}\n`,
  );
  await writeFile(
    path.join(root, 'settings.json'),
    JSON.stringify({ url: plan.url, provider: 'reverse-proxy' }, null, 2),
    { mode: 0o600 },
  );
  return { url: plan.url, configFile: file, profile: 'public' };
}
export async function ensureTunnelTool() {
  try {
    await access(executable());
  } catch {
    execFileSync(process.execPath, ['tools/install-tunnel.js'], {
      stdio: 'inherit',
      windowsHide: true,
    });
  }
}
