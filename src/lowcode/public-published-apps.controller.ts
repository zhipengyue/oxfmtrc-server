import { Controller, Get, Param, Query } from '@nestjs/common';
import { LowcodeAppsService } from './lowcode-apps.service';

@Controller('api/v1/public/apps')
export class PublicPublishedAppsController {
  constructor(private readonly appsService: LowcodeAppsService) {}

  @Get(':account/:appId')
  getPublished(
    @Param('account') account: string,
    @Param('appId') appId: string,
    @Query('version') version?: string,
  ) {
    return this.appsService.getPublicPublished(account, appId, version);
  }
}
