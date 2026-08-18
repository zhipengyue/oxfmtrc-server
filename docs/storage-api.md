# 对象存储（MinIO）

Base URL：`/api/v1/storage`  
认证：`Authorization: Bearer <access_token>`

本地 MinIO（Docker）默认：

| 项 | 值 |
|----|-----|
| S3 API | `http://127.0.0.1:9000` |
| Console | `http://127.0.0.1:9001` |
| Access Key | `minioadmin` |
| Secret Key | `minioadmin` |
| Bucket | `visual-assets`（启动时若不存在则自动创建） |

环境变量见 `.env.example` 中 `MINIO_*`。

---

## POST /api/v1/storage/upload

**上传文件**（`multipart/form-data`）

### Form / Query

| 字段 | 位置 | 必填 | 说明 |
|------|------|------|------|
| `file` | form | 是 | 文件字段 |
| `folder` | query | 否 | 子目录，如 `images`、`assets/icons` |
| `categoryId` | query | 否 | 素材分类 ID（与 `folder` 二选一，见 [material-categories-api.md](./material-categories-api.md)） |

### 成功 200

```json
{
  "key": "uploads/13800138001/icons/2026-08-04/uuid-banner.png",
  "bucket": "visual-assets",
  "url": "http://127.0.0.1:9000/visual-assets/uploads/13800138001/icons/2026-08-04/uuid-banner.png",
  "size": 12345,
  "mimeType": "image/png",
  "originalName": "banner.png"
}
```

- 默认 `MINIO_USE_PUBLIC_URL=true`：`url` 为**永久公开地址**，无 `expiresIn`，不含 `X-Amz-*` 签名参数，可直接用于画布/组件绑定
- 后端启动时会自动为 `visual-assets` bucket 配置匿名读策略
- 若前端 Vite 已代理 `/visual-assets`，可将 `MINIO_PUBLIC_BASE_URL` 设为 `http://localhost:5173`，返回地址走同源代理
- 设为 `MINIO_USE_PUBLIC_URL=false` 时改为预签名 URL（带 `expiresIn` 秒数，会过期）

默认单文件上限 100MB（`MINIO_MAX_UPLOAD_BYTES`）。

---

## GET /api/v1/storage/list

**资源列表**（仅当前用户 `uploads/{phone}/` 下文件，按更新时间倒序）

### Query

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | number | 1 | 页码 |
| `pageSize` | number | 20 | 每页条数，最大 100 |
| `folder` | string | — | 子目录过滤，如 `images` |
| `categoryId` | string | — | 素材分类 ID（与 `folder` 二选一） |

### 成功 200

```json
{
  "list": [
    {
      "key": "uploads/13800138001/images/2026-08-03/uuid-banner.png",
      "bucket": "visual-assets",
      "url": "http://127.0.0.1:9000/visual-assets/uploads/...",
      "size": 12345,
      "mimeType": "image/png",
      "originalName": "banner.png",
      "lastModified": "2026-08-04T02:30:00.000Z"
    }
  ],
  "total": 12,
  "page": 1,
  "pageSize": 20
}
```

---

## GET /api/v1/storage/url

**获取文件访问 URL**

### Query

| 参数 | 说明 |
|------|------|
| `key` | 上传返回的 `key` |

### 成功 200

```json
{
  "url": "http://127.0.0.1:9000/oxfmtrc/uploads/...",
  "expiresIn": 3600
}
```

仅能访问本人目录下文件（`uploads/{phone}/...`）。

---

## DELETE /api/v1/storage?key=...

**删除文件**，成功 **204** 无 body。

仅能删除本人目录下文件。

---

## 前端示例

```javascript
const form = new FormData()
form.append('file', file)

const res = await fetch('/api/v1/storage/upload?folder=images', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
})
const { url, key } = await res.json()
// 低代码组件图片地址可直接绑定 url
```

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-08-04 | 新增 `categoryId` 参数，对接素材分类目录 |
| 2026-08-04 | Bucket 改为 `visual-assets`；新增资源列表接口 |
| 2026-08-03 | 首版：MinIO 上传、获取 URL、删除 |
