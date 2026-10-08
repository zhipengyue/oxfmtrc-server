CREATE TABLE IF NOT EXISTS project_runtime_settings (
  id varchar(36) NOT NULL,
  appId varchar(64) NOT NULL,
  ownerAccount varchar(64) NOT NULL,
  settings json NOT NULL,
  createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_runtime_settings_app (appId),
  KEY idx_project_runtime_settings_owner (ownerAccount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
