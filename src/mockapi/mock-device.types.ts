/** 大屏设备采集 Mock：允许的指标字段 */
export const MOCK_DEVICE_METRICS = [
  'temperature',
  'humidity',
  'power',
  'voltage',
  'pressure',
  'co2',
  'status',
] as const;

export type MockDeviceMetric = (typeof MOCK_DEVICE_METRICS)[number];

export type MockDeviceStatus = 'normal' | 'warning' | 'alarm' | 'offline';

/** 客户端 → 服务端 */
export type MockDeviceClientAction = 'subscribe' | 'unsubscribe' | 'ping';

export interface MockDeviceSubscribePayload {
  action: 'subscribe';
  /** 设备 ID，1–10 个，须为预置 dev-001 … dev-008 */
  deviceIds: string[];
  /** 订阅指标，不传则全部 */
  metrics?: MockDeviceMetric[];
  /** 推送间隔 ms，500–30000，默认 2000 */
  intervalMs?: number;
}

export interface MockDeviceUnsubscribePayload {
  action: 'unsubscribe';
  deviceIds?: string[];
}

export interface MockDevicePingPayload {
  action: 'ping';
  ts?: number;
}

export type MockDeviceClientMessage =
  | MockDeviceSubscribePayload
  | MockDeviceUnsubscribePayload
  | MockDevicePingPayload;

/** 服务端 → 客户端 */
export interface MockDeviceTelemetryItem {
  deviceId: string;
  deviceName: string;
  online: boolean;
  metrics: Partial<Record<MockDeviceMetric, number | string>>;
}

export interface MockDeviceTelemetryMessage {
  type: 'telemetry';
  ts: string;
  devices: MockDeviceTelemetryItem[];
}

export interface MockDeviceSubscribedMessage {
  type: 'subscribed';
  deviceIds: string[];
  metrics: MockDeviceMetric[];
  intervalMs: number;
}

export interface MockDevicePongMessage {
  type: 'pong';
  ts: string;
  clientTs?: number;
}

export interface MockDeviceErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface MockDeviceWelcomeMessage {
  type: 'welcome';
  path: string;
  allowedActions: MockDeviceClientAction[];
  allowedMetrics: MockDeviceMetric[];
  deviceIds: string[];
}

export interface MockDeviceCatalogItem {
  deviceId: string;
  deviceName: string;
  location: string;
  type: string;
}
