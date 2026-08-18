# Mock API（前端调试）

前缀 **`/mockapi`**，**无需登录**，用于低代码编辑器 HTTP / WebSocket 数据源、表格与大屏组件联调。

Base URL（经 Vite 代理）：`http://localhost:5173/mockapi/...`  
直连后端：`http://127.0.0.1:3005/mockapi/...`

WebSocket（经 Vite 需开启 `ws: true`）：  
`ws://localhost:5173/mockapi/ws/device-stream`  
或 `ws://127.0.0.1:3005/mockapi/ws/device-stream`

---

## GET /mockapi/table

分页表格数据。

### Query

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | number | 1 | 页码 |
| `pageSize` | number | 10 | 每页条数，最大 100 |

### 响应 200

```json
{
  "list": [
    {
      "id": 1,
      "name": "用户1",
      "email": "user1@example.com",
      "department": "产品部",
      "status": "inactive",
      "amount": 236.5,
      "createdAt": "2026-02-02T08:00:00.000Z"
    }
  ],
  "total": 57,
  "page": 1,
  "pageSize": 10
}
```

---

## GET /mockapi/table/all

返回全部 57 条（不分页）。

---

## GET /mockapi/devices

**大屏设备目录**（供 WebSocket 订阅前查询可用 `deviceId`）

```json
{
  "list": [
    {
      "deviceId": "dev-001",
      "deviceName": "1号温湿度传感器",
      "location": "A区-机房",
      "type": "sensor"
    }
  ],
  "wsPath": "/mockapi/ws/device-stream"
}
```

预置设备：`dev-001` … `dev-008`。

---

## WebSocket `/mockapi/ws/device-stream`

模拟**可视化大屏**连接设备采集数据的推送通道。

### 连接后首包 `welcome`

```json
{
  "type": "welcome",
  "path": "/mockapi/ws/device-stream",
  "allowedActions": ["subscribe", "unsubscribe", "ping"],
  "allowedMetrics": ["temperature", "humidity", "power", "voltage", "pressure", "co2", "status"],
  "deviceIds": ["dev-001", "dev-002", "..."]
}
```

### 客户端 → 服务端（入参）

所有消息为 **JSON 文本**，须含 `action` 字段。

#### 1. 订阅采集数据 `subscribe`

```json
{
  "action": "subscribe",
  "deviceIds": ["dev-001", "dev-003"],
  "metrics": ["temperature", "humidity", "status"],
  "intervalMs": 2000
}
```

| 字段 | 必填 | 约束 |
|------|------|------|
| `deviceIds` | 是 | 1–10 个，须为预置 `dev-001`…`dev-008` |
| `metrics` | 否 | 指标子集，见 `welcome.allowedMetrics`；不传则全部 |
| `intervalMs` | 否 | 500–30000，默认 2000 |

成功响应：

```json
{
  "type": "subscribed",
  "deviceIds": ["dev-001", "dev-003"],
  "metrics": ["temperature", "humidity", "status"],
  "intervalMs": 2000
}
```

随后按间隔推送 `telemetry`。

#### 2. 取消订阅 `unsubscribe`

```json
{ "action": "unsubscribe", "deviceIds": ["dev-003"] }
```

`deviceIds` 省略则取消全部推送。

#### 3. 心跳 `ping`

```json
{ "action": "ping", "ts": 1710000000000 }
```

响应：

```json
{ "type": "pong", "ts": "2026-06-25T10:00:00.000Z", "clientTs": 1710000000000 }
```

### 服务端 → 客户端（出参）

#### 周期推送 `telemetry`

```json
{
  "type": "telemetry",
  "ts": "2026-06-25T10:00:02.000Z",
  "devices": [
    {
      "deviceId": "dev-001",
      "deviceName": "1号温湿度传感器",
      "online": true,
      "metrics": {
        "temperature": 26.3,
        "humidity": 58.2,
        "status": "normal"
      }
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `deviceId` / `deviceName` | 设备标识与名称 |
| `online` | 是否在线 |
| `metrics` | 仅包含订阅的指标 |
| `metrics.status` | `normal` / `warning` / `alarm` / `offline` |
| 数值类指标 | `temperature`(℃)、`humidity`(%)、`power`(kW)、`voltage`(V)、`pressure`(MPa)、`co2`(ppm) |

#### 错误 `error`

```json
{
  "type": "error",
  "code": "INVALID_DEVICE_IDS",
  "message": "未知设备：dev-999"
}
```

常见 `code`：`INVALID_JSON`、`INVALID_MESSAGE`、`INVALID_DEVICE_IDS`、`TOO_MANY_DEVICES`、`INVALID_METRICS`、`UNKNOWN_ACTION`

---

## 前端配置示例

**HTTP 表格：**

```
/mockapi/table?page=1&pageSize=10
```

**WebSocket 数据源地址：**

```
ws://localhost:5173/mockapi/ws/device-stream
```

连接后发送 subscribe，在 `responseFn` 或 WS 回调里取 `message.devices` 绑定大屏。

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-06-25 | 新增设备采集 WebSocket、GET /mockapi/devices |
| 2026-05-26 | 首版：分页表格、全量表格 |
