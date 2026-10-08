import { All, Controller, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RuntimeProxyService } from './runtime-proxy.service';

@Controller('api/v1/runtime-proxy')
export class RuntimeProxyController {
  constructor(private readonly runtimeProxy: RuntimeProxyService) {}

  @All(':appId/*path')
  async forward(
    @Param('appId') appId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const marker = `/api/v1/runtime-proxy/${encodeURIComponent(appId)}`;
    const originalUrl = request.originalUrl || request.url;
    const relative = originalUrl.startsWith(marker) ? originalUrl.slice(marker.length) : `/${String(request.params.path ?? '')}`;
    const question = relative.indexOf('?');
    const requestPath = question >= 0 ? relative.slice(0, question) : relative;
    const query = question >= 0 ? relative.slice(question + 1) : '';
    const { rule, target } = await this.runtimeProxy.prepare(appId, requestPath || '/', query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const method = request.method.toUpperCase();
      const hasBody = !['GET', 'HEAD'].includes(method);
      const body = hasBody && request.body != null
        ? (Buffer.isBuffer(request.body) || typeof request.body === 'string' ? request.body : JSON.stringify(request.body))
        : undefined;
      const upstream = await fetch(target, {
        method,
        headers: this.runtimeProxy.requestHeaders(request.headers, target, rule.changeOrigin),
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
      const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
      const maxBytes = this.runtimeProxy.maxResponseBytes();
      if (declaredLength > maxBytes) throw new Error('代理响应超过大小限制');
      const payload = Buffer.from(await upstream.arrayBuffer());
      if (payload.length > maxBytes) throw new Error('代理响应超过大小限制');
      response.status(upstream.status).set(this.runtimeProxy.responseHeaders(upstream.headers)).send(payload);
    } finally {
      clearTimeout(timer);
    }
  }
}
