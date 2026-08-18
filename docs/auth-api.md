# 认证接口文档（注册 / 登录）

本文档描述 `oxfmtrc-server` 中与登录、注册相关的 HTTP 接口，供前端页面与联调使用。

## 通用约定

| 项目 | 说明 |
|------|------|
| 基础 URL | `http://<主机>:<端口>`，端口由环境变量 `PORT` 控制，默认 **3005** |
| 路径前缀 | 认证相关接口均在 **`/auth`** 下 |
| 协议 | HTTP |
| 编码 | UTF-8 |
| 请求头 | `Content-Type: application/json` |
| 手机号规则 | 中国大陆 **11 位**：正则 `^1[3-9]\d{9}$`（例：`13800138000`） |

### HTTP 状态码与错误

| 状态码 | 场景 |
|--------|------|
| **200** | 成功 |
| **400** | 参数校验失败（字段格式错误、缺失，或包含未允许的字段） |
| **401** | 登录失败（账号不存在、密码错误、账号类型与注册不一致） |
| **409** | 注册冲突（手机号已被占用） |

服务端启用 `whitelist` + `forbidNonWhitelisted`：**请勿**在 Body 中传入文档未列出的字段，否则可能返回 **400**。

### 登录成功后的令牌

成功 **注册 / 登录 / 刷新** 的响应结构一致，包含：

| 字段 | 说明 |
|------|------|
| `accessToken` | 访问令牌（JWT），用于业务接口 |
| `refreshToken` | 刷新令牌（opaque 字符串），**仅用于** `POST /auth/refresh` |
| `tokenType` | 固定 `Bearer` |
| `expiresIn` | accessToken 有效期，来自 `JWT_EXPIRES_IN`，默认 **`2h`** |
| `refreshExpiresIn` | refreshToken 有效期，来自 `JWT_REFRESH_EXPIRES_IN`，默认 **`30d`** |
| `user` | 当前用户信息 |

- 业务接口请求头：`Authorization: Bearer <accessToken>`
- accessToken 过期（接口 **401**）时，用本地保存的 `refreshToken` 调用刷新接口，换取新的 `accessToken` 与 `refreshToken`（**轮换**：旧 refreshToken 立即作废）
- **不要**把 `refreshToken` 放在普通业务请求的 Header 里

---

## 1. 个人注册

**`POST /auth/register/personal`**

### 请求 Body

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `phone` | string | 是 | 大陆手机号 |
| `password` | string | 是 | 长度 **6–64** |

### 成功响应 `200`

```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<opaque>",
  "tokenType": "Bearer",
  "expiresIn": "2h",
  "refreshExpiresIn": "30d",
  "user": {
    "id": "<uuid>",
    "userType": "personal",
    "phone": "13800138000",
    "companyName": null
  }
}
```

### 业务错误示例

| 状态码 | 说明 |
|--------|------|
| 409 | `该手机号已被注册` |

---

## 2. 企业注册

**`POST /auth/register/enterprise`**

### 请求 Body

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `companyName` | string | 是 | 非空，最长 **200**（服务端会对首尾空白 `trim`） |
| `adminPhone` | string | 是 | 管理员手机号（大陆 11 位），作为该企业账号的登录名 |
| `password` | string | 是 | 长度 **6–64** |

### 成功响应 `200`

结构与「个人注册」相同，`user` 示例：

```json
{
  "accessToken": "<JWT>",
  "tokenType": "Bearer",
  "expiresIn": "7d",
  "user": {
    "id": "<uuid>",
    "userType": "enterprise",
    "phone": "13900139000",
    "companyName": "某某科技有限公司"
  }
}
```

### 业务错误示例

| 状态码 | 说明 |
|--------|------|
| 409 | `该管理员手机号已被注册` |

---

## 3. 登录（个人 / 企业共用）

**`POST /auth/login`**

登录页「下拉选择个人或企业」对应字段 **`accountType`**，必须与用户注册时的类型一致。

### 请求 Body

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `accountType` | string | 是 | **`personal`**（个人）或 **`enterprise`**（企业） |
| `phone` | string | 是 | 个人：本人手机号；企业：**管理员手机号** |
| `password` | string | 是 | 长度 **1–64** |

### 成功响应 `200`

```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<opaque>",
  "tokenType": "Bearer",
  "expiresIn": "2h",
  "refreshExpiresIn": "30d",
  "user": {
    "id": "<uuid>",
    "userType": "personal",
    "phone": "13800138000",
    "companyName": null
  }
}
```

`userType` 与请求中的 `accountType` 一致。

### 业务错误示例

| 状态码 | 说明 |
|--------|------|
| 401 | `账号或密码错误`（含：用户不存在、密码错误、**账号类型选错**） |

---

## 4. 刷新访问令牌

**`POST /auth/refresh`**

当业务接口因 accessToken 过期返回 **401** 时，前端应调用本接口（**无需**在 Header 带已过期的 accessToken）。

### 请求 Body

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `refreshToken` | string | 是 | 登录/注册/上次刷新时下发的 refreshToken |

### 成功响应 `200`

与登录成功结构相同（含新的 `accessToken`、`refreshToken`、`user` 等）。

### 业务错误示例

| 状态码 | 说明 |
|--------|------|
| 401 | `刷新令牌无效或已过期`（含：令牌不存在、已过期、已使用过） |

### 前端建议流程

1. 请求业务 API → 收到 **401**
2. 若本地有 `refreshToken`，调用 `POST /auth/refresh`
3. 成功：更新本地 token，**重试**原请求
4. 刷新也 **401**：清除本地登录态，跳转登录页

---

## 请求示例（curl）

### 个人注册

```bash
curl -s -X POST "http://127.0.0.1:3005/auth/register/personal" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"yourPassword"}'
```

### 企业注册

```bash
curl -s -X POST "http://127.0.0.1:3005/auth/register/enterprise" \
  -H "Content-Type: application/json" \
  -d '{"companyName":"某公司","adminPhone":"13900139000","password":"yourPassword"}'
```

### 个人登录

```bash
curl -s -X POST "http://127.0.0.1:3005/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"accountType":"personal","phone":"13800138000","password":"yourPassword"}'
```

### 企业登录

```bash
curl -s -X POST "http://127.0.0.1:3005/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"accountType":"enterprise","phone":"13900139000","password":"yourPassword"}'
```

### 刷新令牌

```bash
curl -s -X POST "http://127.0.0.1:3005/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<your-refresh-token>"}'
```

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-05-26 | 新增 `POST /auth/refresh`；登录/注册响应增加 `refreshToken` |
| 2026-05-07 | 初版：个人/企业注册与登录、`accountType` 与枚举 `personal` / `enterprise` |

维护说明：接口实现变更时，请同步更新本文档中的路径、字段与状态码说明。
