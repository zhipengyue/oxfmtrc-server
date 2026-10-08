-- 生产环境部署租户/成员功能前执行；开发环境由 TypeORM synchronize 自动创建。
CREATE TABLE IF NOT EXISTS tenants (
  id varchar(36) NOT NULL,
  name varchar(200) NOT NULL,
  ownerUserId varchar(36) NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

ALTER TABLE users
  ADD COLUMN role varchar(32) NULL AFTER companyName,
  ADD COLUMN tenantId varchar(36) NULL AFTER role,
  ADD COLUMN displayName varchar(100) NULL AFTER tenantId,
  ADD COLUMN enabled tinyint NOT NULL DEFAULT 1 AFTER displayName;

CREATE INDEX idx_users_tenant ON users (tenantId);

CREATE TABLE IF NOT EXISTS platform_components (
  id varchar(36) NOT NULL,
  ownerScope varchar(80) NOT NULL,
  platform varchar(10) NOT NULL,
  name varchar(100) NOT NULL,
  description varchar(300) NOT NULL DEFAULT '',
  tags json NOT NULL,
  template mediumtext NOT NULL,
  script mediumtext NOT NULL,
  style mediumtext NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'unpublished',
  coverDataUrl mediumtext NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_platform_components_scope_updated (ownerScope, updatedAt)
);
