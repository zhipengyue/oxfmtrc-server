# 项目 HTTP / 外部请求管理

管理某应用（项目）下的外部数据请求配置，与前端「新增请求」表单字段一致。  
Base：`/api/v1/apps/{appId}/http-requests`，需 **Bearer Token**，且仅能操作本人应用。

---

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `name` | string | 名称（**同一应用下唯一**） |
| `address` | string | 地址 URL |
| `type` | string | `http` / `mqtt` / `websocket` / `db` |
| `method` | string \| null | HTTP 方法：`get` / `post` / `put` / `delete`（仅 type=http） |
| `mqttMode` | string \| null | `subscribe` / `publish`（仅 type=mqtt） |
| `wsMode` | string \| null | `receive` / `send`（仅 type=websocket） |
| `frequencyMs` | number | 请求频率（毫秒） |
| `status` | string | 状态：`enabled`（启用）/ `disabled`（禁用），默认 `enabled` |
| `paramsFn` | string | 动态入参函数源码 |
| `headersFn` | string | 动态请求头函数源码 |
| `responseFn` | string | 返回处理函数，默认 `(res) => { return res.data }` |
| `configText` | string | 额外配置 |

增删改后会同步写入应用草稿 `draftConfig.projectConfig.dataSources`。

---

## GET /api/v1/apps/{appId}/http-requests

**列表**（不含函数字段）

```json
[
  {
    "id": "uuid",
    "name": "表格数据",
    "address": "/mockapi/table?page=1&pageSize=10",
    "type": "http",
    "method": "get",
    "status": "enabled",
    "frequencyMs": 5000,
    "updatedAt": "2026-05-07T08:30:00.000Z"
  }
]
```

---

## GET /api/v1/apps/{appId}/http-requests/{id}

**详情**

```json
{
  "id": "uuid",
  "appId": "app-xxx",
  "name": "表格数据",
  "address": "/mockapi/table",
  "type": "http",
  "method": "get",
  "mqttMode": null,
  "wsMode": null,
  "frequencyMs": 5000,
  "paramsFn": "",
  "headersFn": "",
  "responseFn": "(res) => { return res.list }",
  "configText": "",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## POST /api/v1/apps/{appId}/http-requests

**新增**

```json
{
  "name": "表格数据",
  "address": "/mockapi/table?page=1&pageSize=10",
  "type": "http",
  "method": "get",
  "status": "enabled",
  "frequencyMs": 5000,
  "paramsFn": "",
  "headersFn": "",
  "responseFn": "(res) => { return res.list }",
  "configText": ""
}
```

成功 **200**：返回完整详情对象。

**409**：`该项目下已存在同名请求`

---

## PUT /api/v1/apps/{appId}/http-requests/{id}

**更新**（Body 同新增，全量覆盖）

成功 **200**：返回更新后的详情。

**409**：`该项目下已存在同名请求`（与其他请求重名，不含自身）

---

## DELETE /api/v1/apps/{appId}/http-requests/{id}

**删除**，成功 **204** 无 body。

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-06-26 | 新建应用 / 首次打开列表时自动写入预置 WebSocket「设备采集数据」 |
| 2026-06-25 | 同一应用下 `name` 唯一；新增 `status` |
| 2026-05-26 | 首版：列表、详情、新增、更新、删除 |

---

## 预置 WebSocket 请求

每个应用会自动维护一条 **设备采集数据**（名称唯一，已存在则跳过）：

```json
{
  "name": "设备采集数据",
  "address": "/mockapi/ws/device-stream",
  "type": "websocket",
  "wsMode": "receive",
  "status": "enabled",
  "frequencyMs": 2000,
  "paramsFn": "() => ({ action: 'subscribe', deviceIds: ['dev-001','dev-002','dev-003'], metrics: ['temperature','humidity','status'], intervalMs: 2000 })",
  "responseFn": "(res) => { if (res && res.type === 'telemetry') return res.devices; return res }"
}
```

对应 Mock WebSocket：`docs/mockapi.md`
