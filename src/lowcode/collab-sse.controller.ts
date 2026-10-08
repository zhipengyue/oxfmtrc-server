import {
  Controller,
  MessageEvent,
  NotFoundException,
  Param,
  Query,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, interval, map, merge } from 'rxjs';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { ProjectAccessService } from '../tenants/project-access.service';
import { CollabEventsService } from './collab-events.service';
import { LowcodeApp } from './lowcode-app.entity';

/**
 * 页面协作事件流（SSE）。
 * EventSource 无法自定义 Authorization，因此用 query.access_token 鉴权。
 */
@Controller('api/v1/apps')
export class CollabSseController {
  constructor(
    private readonly collabEvents: CollabEventsService,
    private readonly jwtService: JwtService,
    private readonly projectAccess: ProjectAccessService,
    @InjectRepository(LowcodeApp)
    private readonly appRepo: Repository<LowcodeApp>,
  ) {}

  @Sse(':appId/collab/events')
  async subscribe(
    @Param('appId') appId: string,
    @Query('access_token') accessToken?: string,
  ): Promise<Observable<MessageEvent>> {
    const user = await this.authenticate(accessToken);
    const app = await this.appRepo.findOne({ where: { appId } });
    if (!app) throw new NotFoundException('应用不存在');
    await this.projectAccess.assertCanView(user, app);

    const heartbeat$ = interval(25_000).pipe(
      map(
        () =>
          ({
            data: { type: 'heartbeat', at: new Date().toISOString() },
          }) as MessageEvent,
      ),
    );
    const events$ = this.collabEvents.subscribeApp(appId);
    return merge(events$, heartbeat$);
  }

  private async authenticate(accessToken?: string): Promise<AuthPayload> {
    const token = String(accessToken ?? '').trim();
    if (!token) throw new UnauthorizedException('缺少 access_token');
    try {
      return await this.jwtService.verifyAsync<AuthPayload>(token);
    } catch {
      throw new UnauthorizedException('access_token 无效或已过期');
    }
  }
}
