# 低代码编辑器 · 应用接口

Base URL 前缀：`/api/v1/apps`。认证：`Authorization: Bearer <access_token>`。

**用户维度**：应用归属当前登录用户手机号（JWT `phone`）。

**布局类型 `primaryLayout` / `appType`**：

| 值 | 含义 |
|----|------|
| `web` | Web 端 |
| `mobile` | 移动端 |

**画布布局 `canvasLayoutMode`**（仅 `primaryLayout=web` 时生效，创建后不可改）：

| 值 | 含义 |
|----|------|
| `relative` | 相对布局（流式） |
| `absolute` | 绝对布局（固定画布坐标） |

`mobile` 应用忽略该字段，固定为 `relative`。

---

## GET /api/v1/apps

应用列表（当前用户的全部应用）。

**成功 200**：`AppListItem[]`

```json
[
  {
    "appId": "app-1730000000000-abc123",
    "name": "示例应用",
    "slug": "demo-app",
    "ownerAccount": "13800138000",
    "categoryId": "uuid",
    "primaryLayout": "web",
    "canvasLayoutMode": "relative",
    "updatedAt": "2026-05-07T08:30:00.000Z"
  }
]
```

---

## POST /api/v1/apps

**创建应用**

### 请求 Body

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 应用名称，1–200 字符 |
| `categoryId` | string | 是 | 分类 UUID（须为当前用户下的分类） |
| `primaryLayout` | string | 是 | `web` 或 `mobile` |
| `canvasLayoutMode` | string | 否 | `relative` 或 `absolute`；默认 `relative`；`mobile` 应用固定 `relative` |

**相对布局：**

```json
{
  "name": "flow-layout-demo",
  "categoryId": "550e8400-e29b-41d4-a716-446655440000",
  "primaryLayout": "web",
  "canvasLayoutMode": "relative"
}
```

**绝对布局：**

```json
{
  "name": "absolute-layout-demo",
  "categoryId": "550e8400-e29b-41d4-a716-446655440000",
  "primaryLayout": "web",
  "canvasLayoutMode": "absolute"
}
```

### 成功 201/200

```json
{ "appId": "app-1730000000000-abc123" }
```

创建时会自动生成默认首页（`sortOrder: 0`，名称「首页」）及初始草稿配置。

### 错误

| 状态码 | 说明 |
|--------|------|
| 400 | 参数无效，或分类不存在/不属于当前用户 |

---

## POST /api/v1/apps/{appId}/copy

**复制应用**（含全部页面、布局、请求配置、自定义组件与项目配置）

### 请求 Body

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 新应用名称，1–200 字符 |
| `categoryId` | string | 是 | 目标分类 UUID（须为当前用户下的分类） |

```json
{
  "name": "dashboard-copy",
  "categoryId": "bbf3df8b-cb82-4dc7-ae70-e347f75bd85c"
}
```

### 成功 200

```json
{ "appId": "app-1730000000001-xyz789" }
```

### 复制规则

- 新 `appId`、新 `slug`、新页面 UUID、新 HTTP 请求 UUID
- 布局内 **弹出页**（`popupPageId`）、**跳转页**（`jumpPageId` / `navigatePageId` 等）、**页面数据源**（`pageDataSourceId`）、**自定义 Vue 组件**（`customComponentId`）中的 ID 会同步替换
- 复制 `primaryLayout`、`canvasLayoutMode`、主题、i18n、全局变量、CSS 变量、项目脚本
- **不复制**发布历史（`publishedVersions` 重置为空）
- **不调用**默认预置请求写入（保留源应用已有请求配置）

### 错误

| 状态码 | 说明 |
|--------|------|
| 400 | 参数无效、分类无效、源应用无页面 |
| 403 | 无权访问源应用 |
| 404 | 源应用不存在 |

---

## GET /api/v1/apps/{appId}

**应用详情（含页面列表，不含页面布局 detail）**

### 成功 200

```json
{
  "appId": "app-1",
  "name": "示例应用",
  "categoryId": "550e8400-e29b-41d4-a716-446655440000",
  "primaryLayout": "web",
  "canvasLayoutMode": "absolute",
  "createdAt": "2026-04-12T00:00:00.000Z",
  "updatedAt": "2026-05-07T08:30:00.000Z",
  "pages": [
    {
      "pageId": "page-uuid",
      "name": "首页",
      "sortOrder": 0,
      "createdAt": "2026-04-12T00:00:00.000Z",
      "updatedAt": "2026-05-07T08:30:00.000Z"
    }
  ]
}
```

| 状态码 | 说明 |
|--------|------|
| 404 | 应用不存在 |
| 403 | 无权访问 |

---

## GET /api/v1/apps/{appId}/pages/{pageId}

**页面详情**

### 成功 200

```json
{
  "appId": "app-1",
  "pageId": "page-1",
  "name": "首页",
  "sortOrder": 0,
  "createdAt": "2026-04-12T00:00:00.000Z",
  "updatedAt": "2026-05-07T08:30:00.000Z",
  "appType": "web",
  "detail": {
    "nodes": []
  }
}
```

- `appType`：与应用创建时的 `primaryLayout` 一致（`web` / `mobile`）
- `detail`：页面布局 JSON（`LayoutRoot`，含 `nodes`、可选 `props`）

| 状态码 | 说明 |
|--------|------|
| 404 | 应用或页面不存在 |
| 403 | 无权访问 |

---

## PUT /api/v1/apps/{appId}/pages/{pageId}/detail

**保存页面布局详情**

覆盖式保存当前页面的 `detail`（与 GET 页面详情中的 `detail` 字段结构一致），并同步更新应用草稿 `draftConfig`。

### 请求 Body

```json
{
  "detail": {
    "nodes": [],
    "props": {}
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `detail` | object | 是 | `LayoutRoot`：`nodes` 为组件树数组，可选 `props` |

### 成功 200

与 **GET 页面详情** 响应结构相同（含更新后的 `updatedAt`、`detail`）。

| 状态码 | 说明 |
|--------|------|
| 404 | 应用或页面不存在 |
| 403 | 无权访问 |
| 400 | `detail` 非对象 |

---

## POST /api/v1/apps/{appId}/pages

**新增页面**

### 请求 Body（可选）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 页面名称；不传时默认为 `页面 N` |

```json
{ "name": "关于我们" }
```

### 成功 200

```json
{
  "pageId": "uuid",
  "name": "关于我们",
  "sortOrder": 1,
  "createdAt": "2026-05-07T08:30:00.000Z",
  "updatedAt": "2026-05-07T08:30:00.000Z"
}
```

新页面追加在列表末尾（`sortOrder` 为当前最大值 + 1），`detail` 初始为空布局 `{ "nodes": [] }`。

---

## PUT /api/v1/apps/{appId}/pages/{pageId}

**重命名页面**

### 请求 Body

```json
{ "name": "新页面名称" }
```

### 成功 200

返回更新后的 `AppPageListItem`（结构同新增页面响应）。

| 状态码 | 说明 |
|--------|------|
| 404 | 页面不存在 |

---

## DELETE /api/v1/apps/{appId}/pages/{pageId}

**删除页面**

- **成功 204**：无响应体
- **400**：`至少保留一个页面`
- **404**：页面不存在

删除后会按剩余页面重新从 0 编号 `sortOrder`。

---

## PUT /api/v1/apps/{appId}/pages/order

**拖拽排序（更新页面顺序）**

前端拖拽结束后，将**当前完整顺序**的 `pageId` 数组一次性提交即可。

### 请求 Body

```json
{
  "pageIds": [
    "page-uuid-3",
    "page-uuid-1",
    "page-uuid-2"
  ]
}
```

| 规则 | 说明 |
|------|------|
| 长度 | 必须等于该应用下页面总数 |
| 内容 | 须包含全部页面 id，且不能重复 |
| 顺序 | 数组下标即新 `sortOrder`（0 起） |

### 成功 200

```json
{
  "pages": [
    {
      "pageId": "page-uuid-3",
      "name": "首页",
      "sortOrder": 0,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

| 状态码 | 说明 |
|--------|------|
| 400 | pageIds 不完整、含非法 id 或重复 |

---

## GET /api/v1/apps/{appId}/draft

**草稿完整配置**（编辑器用，整块 `AppFullConfig` JSON）

| 状态码 | 说明 |
|--------|------|
| 404 / 403 | 同应用详情 |

---

## 数据表

| 表名 | 说明 |
|------|------|
| `lowcode_apps` | 应用元数据 + `draftConfig` |
| `lowcode_pages` | 页面元数据 + `detail` 布局 JSON |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-05-26 | 新增：保存页面 detail（PUT .../detail） |
| 2026-05-26 | 新增：页面新增/重命名/删除/拖拽排序 |
| 2026-05-26 | 新增：创建应用、应用详情（页面列表）、页面详情 |
| 2026-05-07 | 首版：列表、草稿详情 |
