import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve('tools/mcp-proxy.js')],
  stderr: 'inherit',
});
const client = new Client({ name: 'mineblox', version: '0.2.0' });
try {
  await client.connect(transport);
  const name = process.argv[2];
  if (name === '--schema') {
    const result = await client.listTools();
    const names = process.argv.slice(3);
    console.log(
      JSON.stringify(
        result.tools.filter((t) => names.includes(t.name)),
        null,
        2,
      ),
    );
  } else {
    const result = name
      ? await client.callTool(
          {
            name,
            arguments: JSON.parse(
              process.argv[3]?.startsWith('@')
                ? await readFile(process.argv[3].slice(1), 'utf8')
                : (process.argv[3] ?? '{}'),
            ),
          },
          undefined,
          { timeout: 120000 },
        )
      : await client.listTools();
    for (const content of result.content ?? []) {
      if (content.type === 'image') {
        await writeFile(
          '.local/roblox/studio-screen.png',
          Buffer.from(content.data, 'base64'),
        );
        content.data = '[Saved .local/roblox/studio-screen.png]';
      }
    }
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await client.close();
}
