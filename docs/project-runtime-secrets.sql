CREATE TABLE IF NOT EXISTS project_runtime_secrets (
  id varchar(36) NOT NULL,
  appId varchar(64) NOT NULL,
  ownerAccount varchar(64) NOT NULL,
  name varchar(100) NOT NULL,
  note varchar(300) NOT NULL DEFAULT '',
  encryptedValue text NOT NULL,
  encryptionIv varchar(64) NOT NULL,
  encryptionTag varchar(64) NOT NULL,
  createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_runtime_secret_app_name (appId, name),
  KEY idx_project_runtime_secret_owner (ownerAccount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
