CREATE INDEX idx_lowcode_apps_owner_updated
  ON lowcode_apps (ownerAccount, updatedAt);
