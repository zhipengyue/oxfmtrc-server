import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User, buildLoginKey } from './user.entity';
import { LowcodeApp } from '../lowcode/lowcode-app.entity';

/**
 * 一次性数据修复：
 * 1) 补全 users.loginKey
 * 2) 将仍以手机号为 ownerAccount 的记录改写为 user.id
 */
@Injectable()
export class OwnerAccountMigrationService implements OnModuleInit {
  private readonly logger = new Logger(OwnerAccountMigrationService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(LowcodeApp) private readonly apps: Repository<LowcodeApp>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureLoginKeys();
      await this.migrateOwnerAccounts();
    } catch (err: unknown) {
      this.logger.warn(
        `所有者迁移跳过或失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async ensureLoginKeys(): Promise<void> {
    const rows = await this.users.find();
    let updated = 0;
    for (const row of rows) {
      try {
        const next = buildLoginKey(row.userType, row.phone, row.tenantId);
        if (row.loginKey !== next) {
          row.loginKey = next;
          await this.users.save(row);
          updated += 1;
        }
      } catch (err: unknown) {
        this.logger.warn(
          `跳过用户 ${row.id} loginKey: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (updated) this.logger.log(`已补全 ${updated} 条用户 loginKey`);
  }

  private async migrateOwnerAccounts(): Promise<void> {
    // 旧数据 phone 全局唯一；按 phone → id 映射。若已出现同号多身份，取最早创建的一条。
    const rows = await this.users.find({
      select: { id: true, phone: true, createdAt: true },
      order: { createdAt: 'ASC' },
    });
    const phoneToId = new Map<string, string>();
    for (const u of rows) {
      if (!phoneToId.has(u.phone)) phoneToId.set(u.phone, u.id);
    }

    let total = 0;
    for (const [phone, id] of phoneToId) {
      if (!/^1\d{10}$/.test(phone)) continue;
      for (const table of [
        'lowcode_apps',
        'categories',
        'project_runtime_secrets',
        'project_runtime_settings',
        'preview_tickets',
      ]) {
        try {
          const res = (await this.dataSource.query(
            `UPDATE \`${table}\` SET \`ownerAccount\` = ? WHERE \`ownerAccount\` = ?`,
            [id, phone],
          )) as { affectedRows?: number };
          total += Number(res?.affectedRows ?? 0);
        } catch {
          // 表可能尚不存在
        }
      }
    }

    const apps = await this.apps.find({
      select: { id: true, ownerAccount: true, draftConfig: true },
    });
    for (const app of apps) {
      const draft = app.draftConfig as Record<string, unknown> | null;
      if (!draft || typeof draft !== 'object') continue;
      const embedded = String(draft.ownerAccount ?? '');
      if (/^1\d{10}$/.test(embedded)) {
        const mapped = phoneToId.get(embedded) ?? app.ownerAccount;
        if (draft.ownerAccount !== mapped) {
          draft.ownerAccount = mapped;
          await this.apps.save(app);
        }
      } else if (embedded && embedded !== app.ownerAccount) {
        draft.ownerAccount = app.ownerAccount;
        await this.apps.save(app);
      }
    }

    if (total) this.logger.log(`已迁移 ${total} 处 ownerAccount 手机号 → userId`);
  }
}
