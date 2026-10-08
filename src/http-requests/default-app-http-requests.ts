import {
  HttpRequestStatus,
  HttpRequestType,
  WsMode,
} from './http-request.enums';

/**
 * 历史预置：曾在新建应用时自动写入。
 * 现已停用，仅保留模板供文档/手动复用；ensureDefaultRequests 会清理同名同地址遗留项。
 */
export const DEFAULT_WEBSOCKET_DEVICE_STREAM = {
  name: '设备采集数据',
  address: '/mockapi/ws/device-stream',
  type: HttpRequestType.WEBSOCKET,
  method: null,
  mqttMode: null,
  wsMode: WsMode.RECEIVE,
  frequencyMs: 2000,
  status: HttpRequestStatus.ENABLED,
  paramsFn: `() => ({
  action: 'subscribe',
  deviceIds: ['dev-001', 'dev-002', 'dev-003'],
  metrics: ['temperature', 'humidity', 'status'],
  intervalMs: 2000
})`,
  headersFn: '',
  responseFn: `(res) => {
  if (res && res.type === 'telemetry') return res.devices
  return res
}`,
  configText: '',
} as const;

/** 新建应用不再自动写入任何预置请求 */
export const DEFAULT_APP_HTTP_REQUESTS: ReadonlyArray<
  typeof DEFAULT_WEBSOCKET_DEVICE_STREAM
> = [];
