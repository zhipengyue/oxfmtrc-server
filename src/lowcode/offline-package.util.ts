import { promises as fs } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { BadRequestException } from '@nestjs/common';
import { standaloneServerSource } from './standalone-server-source';

interface ZipEntry { name: string; data: Buffer; crc: number; offset?: number }

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ name: string; data: Buffer }>): Buffer {
  const entries: ZipEntry[] = files.map((file) => ({ ...file, crc: crc32(file.data) }));
  const locals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'));
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8); header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.data.length, 18); header.writeUInt32LE(entry.data.length, 22); header.writeUInt16LE(name.length, 26);
    entry.offset = offset;
    locals.push(header, name, entry.data);
    offset += header.length + name.length + entry.data.length;
  }
  const centralOffset = offset;
  const centrals: Buffer[] = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'));
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10); header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.data.length, 20); header.writeUInt32LE(entry.data.length, 24); header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(entry.offset ?? 0, 42);
    centrals.push(header, name);
    offset += header.length + name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(offset - centralOffset, 12); end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

async function collectFiles(root: string): Promise<Array<{ name: string; data: Buffer }>> {
  const files: Array<{ name: string; data: Buffer }> = [];
  async function visit(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push({ name: relative(root, path).split(sep).join('/'), data: await fs.readFile(path) });
    }
  }
  await visit(root);
  return files;
}

async function resolveDistRoot(): Promise<string> {
  const candidates = [process.env.OFFLINE_WEB_DIST, resolve(process.cwd(), '../oxfmtrc/dist'), resolve(process.cwd(), 'public')].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try { if ((await fs.stat(join(candidate, 'index.html'))).isFile()) return candidate; } catch { /* next */ }
  }
  throw new BadRequestException('未找到前端 dist，请先构建前端或配置 OFFLINE_WEB_DIST');
}

export async function buildOfflinePackage(snapshot: Record<string, unknown>): Promise<Buffer> {
  const dist = await resolveDistRoot();
  const files = await collectFiles(dist);
  const index = files.find((file) => file.name === 'index.html');
  if (!index) throw new BadRequestException('前端 dist 缺少 index.html');
  const safeJson = JSON.stringify(snapshot).replace(/<\/script/gi, '<\\/script');
  const bootstrap = `<script>window.__OXFMTRC_OFFLINE_CONFIG__=${safeJson};history.replaceState(null,'','/lowcode/app/offline/${encodeURIComponent(String(snapshot.appId ?? 'app'))}');</script>`;
  index.data = Buffer.from(index.data.toString('utf8').replace('</head>', `${bootstrap}</head>`));
  const runtime = snapshot.runtimeSettings && typeof snapshot.runtimeSettings === 'object' ? snapshot.runtimeSettings as Record<string, unknown> : {};
  files.push(
    { name: 'app.config.json', data: Buffer.from(JSON.stringify(snapshot, null, 2)) },
    { name: 'proxy.config.json', data: Buffer.from(JSON.stringify({ port: 8080, proxies: runtime.proxies ?? [], auth: runtime.auth ?? {} }, null, 2)) },
    { name: 'server.js', data: Buffer.from(standaloneServerSource()) },
    { name: 'README.txt', data: Buffer.from('独立部署包\n\n1. 按项目设置中的环境变量名配置第三方账号、密码或固定 Token。\n2. 在当前目录运行：node server.js\n3. 浏览器访问：http://localhost:8080\n\n端口可通过 PORT 环境变量修改。敏感凭证不要写入 proxy.config.json。\n') },
  );
  return zipStore(files);
}
