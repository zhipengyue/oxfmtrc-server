import {
  HttpRequestStatus,
  HttpRequestType,
  WsMode,
} from './http-request.enums';

/** 新建/首次打开请求列表时自动写入的预置 WebSocket 请求（大屏设备采集） */
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

export const DEFAULT_APP_HTTP_REQUESTS = [DEFAULT_WEBSOCKET_DEVICE_STREAM];
