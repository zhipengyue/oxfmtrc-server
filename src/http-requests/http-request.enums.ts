export enum HttpRequestType {
  HTTP = 'http',
  MQTT = 'mqtt',
  WEBSOCKET = 'websocket',
  DB = 'db',
}

export enum HttpMethod {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  DELETE = 'delete',
}

export enum MqttMode {
  SUBSCRIBE = 'subscribe',
  PUBLISH = 'publish',
}

export enum WsMode {
  RECEIVE = 'receive',
  SEND = 'send',
}

/** 启用 / 禁用 */
export enum HttpRequestStatus {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
}
