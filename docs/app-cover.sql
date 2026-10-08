-- 生产环境关闭了 TypeORM synchronize，部署新版服务前执行一次。
ALTER TABLE lowcode_apps
  ADD COLUMN coverUrl MEDIUMTEXT NULL AFTER canvasLayoutMode;
