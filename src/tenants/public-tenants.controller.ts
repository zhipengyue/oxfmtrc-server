import { Controller, Get, Query } from '@nestjs/common';
import { OrganizationService } from './organization.service';

/** 登录页企业搜索，无需登录 */
@Controller('api/v1/public/tenants')
export class PublicTenantsController {
  constructor(private readonly service: OrganizationService) {}

  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number(limit) : 20;
    return this.service.searchTenants(q ?? '', Number.isFinite(n) ? n : 20);
  }
}
