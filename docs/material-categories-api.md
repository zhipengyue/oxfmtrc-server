# 素材分类（MinIO visual-assets）

Base URL：`/api/v1/material-categories`  
认证：`Authorization: Bearer <access_token>`

素材分类与 MinIO bucket **`visual-assets`** 下的目录一一对应。每个用户拥有独立前缀：

```
visual-assets/uploads/{ownerAccount}/{slug}/
```

- `ownerAccount`：当前登录用户手机号（非法字符会替换为 `_`）
- `slug`：由分类名称生成的目录名（英文小写、连字符，冲突时自动追加 `-2`、`-3` …）

创建分类时会在 MinIO 写入占位对象 `{prefix}.keep`；删除分类时会删除该前缀下**全部对象**（含素材文件与 `.keep`）。

---

## GET /api/v1/material-categories

**获取当前用户的素材分类列表**（按创建时间升序）

### 成功 200

```json
[
  {
    "id": "uuid",
    "name": "图标",
    "slug": "icons",
    "bucket": "visual-assets",
    "objectPrefix": "uploads/13800138001/icons/",
    "assetCount": 12,
    "createdAt": "2026-08-04T02:00:00.000Z",
    "updatedAt": "2026-08-04T02:00:00.000Z"
  }
]
```

`assetCount` 为目录下素材数量（不含 `.keep` 占位文件）。

---

## POST /api/v1/material-categories

**新建素材分类**（同时在 MinIO 创建对应目录）

### Body

```json
{
  "name": "图标"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 分类名称，1–100 字符，同用户下不可重复 |

### 成功 200

返回单条分类对象（结构同列表项）。

### 错误

| 状态码 | 说明 |
|--------|------|
| 409 | 分类名称已存在 |
| 503 | MinIO 不可用 |

---

## DELETE /api/v1/material-categories/:id

**删除素材分类**（同时删除 MinIO 目录下全部素材）

成功 **204** 无 body。

### 错误

| 状态码 | 说明 |
|--------|------|
| 404 | 分类不存在 |
| 403 | 无权操作 |
| 503 | MinIO 不可用 |

---

## 与对象存储上传/列表联动

上传或列出素材时，可使用 `categoryId` 指定分类目录（与 `folder` 二选一）：

```javascript
// 上传到「图标」分类
const form = new FormData()
form.append('file', file)
await fetch(`/api/v1/storage/upload?categoryId=${categoryId}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
})

// 列出该分类下素材
await fetch(`/api/v1/storage/list?categoryId=${categoryId}&page=1&pageSize=20`, {
  headers: { Authorization: `Bearer ${token}` },
})
```

详见 [storage-api.md](./storage-api.md)。

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-08-04 | 首版：列表、创建、删除；对接 visual-assets bucket |
