import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Server as HttpServer } from 'http';
import type { RawData, WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { MockDeviceStreamService } from './mock-device-stream.service';
import {
  MOCK_DEVICE_METRICS,
  MockDeviceClientMessage,
  MockDeviceMetric,
  MockDeviceSubscribePayload,
} from './mock-device.types';

const WS_PATH = '/mockapi/ws/device-stream';
const MIN_INTERVAL = 500;
const MAX_INTERVAL = 30_000;
const MAX_DEVICES = 10;

interface ClientState {
  deviceIds: string[];
  metrics: MockDeviceMetric[];
  intervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
}

@Injectable()
export class MockDeviceWsServer implements OnModuleDestroy {
  private readonly logger = new Logger(MockDeviceWsServer.name);
  private wss: WebSocketServer | null = null;
  private readonly clients = new Map<WebSocket, ClientState>();

  constructor(private readonly streamService: MockDeviceStreamService) {}

  attach(httpServer: HttpServer): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ server: httpServer, path: WS_PATH });

    this.wss.on('connection', (socket) => {
      this.clients.set(socket, {
        deviceIds: [],
        metrics: [...MOCK_DEVICE_METRICS],
        intervalMs: 2000,
        timer: null,
      });

      this.send(socket, {
        type: 'welcome',
        path: WS_PATH,
        allowedActions: ['subscribe', 'unsubscribe', 'ping'],
        allowedMetrics: [...MOCK_DEVICE_METRICS],
        deviceIds: this.streamService.getAllowedDeviceIds(),
      });

      socket.on('message', (raw) => this.onMessage(socket, raw));
      socket.on('close', () => this.cleanupClient(socket));
      socket.on('error', () => this.cleanupClient(socket));
    });

    this.logger.log(`WebSocket mock listening on ${WS_PATH}`);
  }

  onModuleDestroy(): void {
    for (const [socket] of this.clients) {
      this.cleanupClient(socket);
      socket.close();
    }
    this.wss?.close();
    this.wss = null;
  }

  private onMessage(socket: WebSocket, raw: RawData): void {
    let body: unknown;
    try {
      body = JSON.parse(raw.toString());
    } catch {
      this.sendError(socket, 'INVALID_JSON', '消息须为 JSON 对象');
      return;
    }

    if (!body || typeof body !== 'object' || !('action' in body)) {
      this.sendError(socket, 'INVALID_MESSAGE', '缺少 action 字段');
      return;
    }

    const msg = body as MockDeviceClientMessage;
    switch (msg.action) {
      case 'subscribe':
        this.handleSubscribe(socket, msg);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(socket, msg.deviceIds);
        break;
      case 'ping':
        this.send(socket, {
          type: 'pong',
          ts: new Date().toISOString(),
          clientTs: msg.ts,
        });
        break;
      default:
        this.sendError(
          socket,
          'UNKNOWN_ACTION',
          'action 仅支持 subscribe / unsubscribe / ping',
        );
    }
  }

  private handleSubscribe(
    socket: WebSocket,
    msg: MockDeviceSubscribePayload,
  ): void {
    const allowed = new Set(this.streamService.getAllowedDeviceIds());
    if (!Array.isArray(msg.deviceIds) || msg.deviceIds.length === 0) {
      this.sendError(socket, 'INVALID_DEVICE_IDS', 'deviceIds 须为非空数组');
      return;
    }
    if (msg.deviceIds.length > MAX_DEVICES) {
      this.sendError(
        socket,
        'TOO_MANY_DEVICES',
        `deviceIds 最多 ${MAX_DEVICES} 个`,
      );
      return;
    }
    const invalid = msg.deviceIds.filter((id) => !allowed.has(id));
    if (invalid.length) {
      this.sendError(
        socket,
        'INVALID_DEVICE_IDS',
        `未知设备：${invalid.join(', ')}，可用见 welcome.deviceIds`,
      );
      return;
    }

    const metrics = this.streamService.resolveMetrics(msg.metrics);
    if (msg.metrics?.length && metrics.length === 0) {
      this.sendError(
        socket,
        'INVALID_METRICS',
        `metrics 须为 ${MOCK_DEVICE_METRICS.join(' / ')} 的子集`,
      );
      return;
    }

    let intervalMs = msg.intervalMs ?? 2000;
    if (!Number.isFinite(intervalMs)) intervalMs = 2000;
    intervalMs = Math.min(
      MAX_INTERVAL,
      Math.max(MIN_INTERVAL, Math.round(intervalMs)),
    );

    const state = this.clients.get(socket);
    if (!state) return;

    this.stopPush(state);
    state.deviceIds = [...msg.deviceIds];
    state.metrics = metrics;
    state.intervalMs = intervalMs;

    this.send(socket, {
      type: 'subscribed',
      deviceIds: state.deviceIds,
      metrics: state.metrics,
      intervalMs: state.intervalMs,
    });

    this.pushTelemetry(socket, state);
    state.timer = setInterval(
      () => this.pushTelemetry(socket, state),
      state.intervalMs,
    );
  }

  private handleUnsubscribe(
    socket: WebSocket,
    deviceIds?: string[],
  ): void {
    const state = this.clients.get(socket);
    if (!state) return;

    if (!deviceIds?.length) {
      this.stopPush(state);
      state.deviceIds = [];
      return;
    }

    state.deviceIds = state.deviceIds.filter((id) => !deviceIds.includes(id));
    if (state.deviceIds.length === 0) {
      this.stopPush(state);
      return;
    }

    this.stopPush(state);
    state.timer = setInterval(
      () => this.pushTelemetry(socket, state),
      state.intervalMs,
    );
  }

  private pushTelemetry(socket: WebSocket, state: ClientState): void {
    if (socket.readyState !== socket.OPEN || !state.deviceIds.length) return;
    this.send(socket, {
      type: 'telemetry',
      ts: new Date().toISOString(),
      devices: this.streamService.buildTelemetry(
        state.deviceIds,
        state.metrics,
      ),
    });
  }

  private stopPush(state: ClientState): void {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  private cleanupClient(socket: WebSocket): void {
    const state = this.clients.get(socket);
    if (state) this.stopPush(state);
    this.clients.delete(socket);
  }

  private send(socket: WebSocket, payload: object): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    this.send(socket, { type: 'error', code, message });
  }
}
