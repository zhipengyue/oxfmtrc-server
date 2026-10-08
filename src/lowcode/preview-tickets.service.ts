import { createHash, randomBytes } from 'crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { LowcodeApp } from './lowcode-app.entity';
import { PreviewTicket } from './preview-ticket.entity';
import { ProjectAccessService } from '../tenants/project-access.service';

const PREVIEW_TICKET_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class PreviewTicketsService {
  constructor(
    @InjectRepository(LowcodeApp) private readonly appRepo: Repository<LowcodeApp>,
    @InjectRepository(PreviewTicket) private readonly ticketRepo: Repository<PreviewTicket>,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async create(appId: string, snapshot: Record<string, unknown>, user: AuthPayload) {
    const app = await this.appRepo.findOne({ where: { appId } });
    if (!app) throw new NotFoundException('应用不存在');
    await this.projectAccess.assertCanView(user, app);
    if (String(snapshot.appId ?? '') !== appId) throw new UnauthorizedException('预览快照与应用不匹配');

    await this.ticketRepo.delete({ expiresAt: LessThan(new Date()) });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + PREVIEW_TICKET_TTL_MS);
    await this.ticketRepo.save(this.ticketRepo.create({
      tokenHash: this.hash(token), appId, ownerAccount: app.ownerAccount,
      snapshot: JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>, expiresAt,
    }));
    return { ticket: token, expiresAt: expiresAt.toISOString(), expiresInSeconds: PREVIEW_TICKET_TTL_MS / 1000 };
  }

  async resolve(token: string): Promise<Record<string, unknown>> {
    const row = await this.ticketRepo.findOne({ where: { tokenHash: this.hash(token) } });
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      if (row) await this.ticketRepo.remove(row);
      throw new NotFoundException('真机预览地址不存在或已过期');
    }
    return row.snapshot;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
