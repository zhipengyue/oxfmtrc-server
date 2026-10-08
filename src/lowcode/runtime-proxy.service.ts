import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { Repository } from 'typeorm';
import { LowcodeApp } from './lowcode-app.entity';
import { ProjectRuntimeSettingsStoreService } from './project-runtime-settings-store.service';

interface RuntimeProxyRule {
  path: string;
  target: string;
  changeOrigin: boolean;
  rewriteEnabled: boolean;
  rewriteFrom: string;
  rewriteTo: string;
}

const BLOCKED_REQUEST_HEADERS = new Set(['connection', 'content-length', 'host', 'transfer-encoding']);
// fetch 会自动解压响应，因此不能把上游的 content-encoding 原样带回浏览器。
const BLOCKED_RESPONSE_HEADERS = new Set(['connection', 'content-encoding', 'content-length', 'transfer-encoding']);

function normalizedPath(value: unknown): string {
  const path = String(value ?? '').trim();
  if (!path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new BadRequestException('代理路径必须是安全的绝对路径');
  }
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase().replace(/^::ffff:/, '');
  if (value === '::1' || value === '0.0.0.0') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

@Injectable()
export class RuntimeProxyService {
  constructor(
    @InjectRepository(LowcodeApp) private readonly appRepo: Repository<LowcodeApp>,
    private readonly settingsStore: ProjectRuntimeSettingsStoreService,
    private readonly config: ConfigService,
  ) {}

  async prepare(appId: string, requestPath: string, queryString: string) {
    const app = await this.appRepo.findOne({ where: { appId } });
    if (!app) throw new NotFoundException('应用不存在');
    const settings = await this.settingsStore.read(appId);
    const rules = this.readRules(settings?.proxies);
    const path = normalizedPath(requestPath);
    const rule = rules
      .filter((item) => path === item.path || path.startsWith(`${item.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!rule) throw new NotFoundException('当前项目没有匹配的代理规则');

    const target = new URL(rule.target);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
      throw new BadRequestException('代理目标仅支持不含账号信息的 HTTP/HTTPS 地址');
    }
    await this.assertSafeTarget(target);
    const rewritten = this.rewritePath(path, rule);
    const basePath = target.pathname === '/' ? '' : target.pathname.replace(/\/$/, '');
    target.pathname = `${basePath}${rewritten.startsWith('/') ? rewritten : `/${rewritten}`}`;
    target.search = queryString ? `?${queryString}` : '';
    return { rule, target };
  }

  requestHeaders(headers: Record<string, string | string[] | undefined>, target: URL, changeOrigin: boolean) {
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      if (BLOCKED_REQUEST_HEADERS.has(name.toLowerCase()) || value == null) continue;
      result[name] = Array.isArray(value) ? value.join(', ') : value;
    }
    if (changeOrigin) result.host = target.host;
    return result;
  }

  responseHeaders(headers: Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, name) => {
      if (!BLOCKED_RESPONSE_HEADERS.has(name.toLowerCase())) result[name] = value;
    });
    return result;
  }

  maxResponseBytes() {
    return Math.max(1, this.config.get<number>('RUNTIME_PROXY_MAX_RESPONSE_MB', 20)) * 1024 * 1024;
  }

  private readRules(raw: unknown): RuntimeProxyRule[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const value = entry as Record<string, unknown>;
      try {
        const target = String(value.target ?? '').trim();
        if (!target) return [];
        return [{
          path: normalizedPath(value.path),
          target,
          changeOrigin: value.changeOrigin !== false,
          rewriteEnabled: value.rewriteEnabled === true,
          rewriteFrom: String(value.rewriteFrom ?? ''),
          rewriteTo: String(value.rewriteTo ?? ''),
        }];
      } catch {
        return [];
      }
    });
  }

  private rewritePath(path: string, rule: RuntimeProxyRule): string {
    if (!rule.rewriteEnabled) return path;
    if (!rule.rewriteFrom || rule.rewriteFrom.length > 200 || !rule.rewriteFrom.startsWith('^')) {
      throw new BadRequestException('路径重写规则无效');
    }
    try {
      return path.replace(new RegExp(rule.rewriteFrom), rule.rewriteTo);
    } catch {
      throw new BadRequestException('路径重写规则无效');
    }
  }

  private async assertSafeTarget(target: URL) {
    const configured = this.config.get<string>('RUNTIME_PROXY_ALLOW_PRIVATE_TARGETS');
    const allowPrivate = configured == null
      ? this.config.get<string>('NODE_ENV', 'development') !== 'production'
      : configured === 'true';
    if (allowPrivate) return;
    const addresses = isIP(target.hostname)
      ? [{ address: target.hostname }]
      : await lookup(target.hostname, { all: true }).catch(() => { throw new BadGatewayException('代理目标域名解析失败'); });
    if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
      throw new BadRequestException('生产环境禁止代理到本机、内网或链路本地地址');
    }
  }
}
