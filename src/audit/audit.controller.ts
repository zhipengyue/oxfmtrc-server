import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto, QueryAuditStatsDto } from './dto/query-audit.dto';

@Controller('api/v1/audit-logs')
@UseGuards(AuthGuard('jwt'))
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthPayload, @Query() query: QueryAuditStatsDto) {
    return this.audit.stats(user, query);
  }

  @Get()
  list(@CurrentUser() user: AuthPayload, @Query() query: QueryAuditLogsDto) {
    return this.audit.list(user, query);
  }
}
