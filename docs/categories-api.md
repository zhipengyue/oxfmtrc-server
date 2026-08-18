# 分类管理接口

Base URL 前缀：`/api/v1/categories`。  
认证：`Authorization: Bearer <access_token>`（登录接口返回的 `accessToken`）。

分类按 **当前登录用户手机号**（JWT `phone`）隔离；同一用户下 **分类名称不可重复**。

---

## 数据模型 `CategoryItem`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 分类 UUID |
| `name` | string | 分类名称，1–100 字符 |
| `createdAt` | string | 创建时间，ISO 8601 |
| `updatedAt` | string | 更新时间，ISO 8601 |

---

## GET /api/v1/categories

**分类列表**

- **认证**：必填
- **成功 200**：`CategoryItem[]`，按创建时间升序
- **无数据**：`[]`

---

## POST /api/v1/categories

**新增分类**

- **认证**：必填
- **请求 Body**：

```json
{ "name": "分类名称" }
```

- **成功 201/200**：`CategoryItem`
- **409**：`该分类名称已存在`
- **400**：参数校验失败

---

## PUT /api/v1/categories/{id}

**编辑分类**

- **认证**：必填
- **路径参数**：`id` — 分类 UUID
- **请求 Body**：

```json
{ "name": "新分类名称" }
```

- **成功 200**：更新后的 `CategoryItem`
- **404**：分类不存在
- **403**：无权操作（非本人分类）
- **409**：新名称与同用户下其他分类重复

---

## DELETE /api/v1/categories/{id}

**删除分类**

- **认证**：必填
- **路径参数**：`id` — 分类 UUID
- **成功 204**：无响应体
- **404**：分类不存在
- **403**：无权操作

---

## 请求示例（curl）

先登录获取 token，再：

```bash
# 列表
curl -s "http://127.0.0.1:3005/api/v1/categories" \
  -H "Authorization: Bearer <token>"

# 新增
curl -s -X POST "http://127.0.0.1:3005/api/v1/categories" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"默认分类"}'

# 编辑
curl -s -X PUT "http://127.0.0.1:3005/api/v1/categories/<id>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"重命名分类"}'

# 删除
curl -s -X DELETE "http://127.0.0.1:3005/api/v1/categories/<id>" \
  -H "Authorization: Bearer <token>"
```

---

## 数据表

表名：`categories`（非生产环境 TypeORM `synchronize` 自动建表）

| 列 | 说明 |
|----|------|
| `id` | UUID 主键 |
| `ownerAccount` | 归属用户（手机号） |
| `name` | 分类名称 |
| `(ownerAccount, name)` | 联合唯一 |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-05-07 | 首版：列表、新增、编辑、删除 |
