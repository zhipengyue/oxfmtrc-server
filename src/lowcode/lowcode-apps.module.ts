import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { HttpRequestsModule } from '../http-requests/http-requests.module';
import { Category } from '../categories/category.entity';
import { AppHttpRequest } from '../http-requests/http-request.entity';
import { User } from '../users/user.entity';
import { LowcodeApp } from './lowcode-app.entity';
import { LowcodePage } from './lowcode-page.entity';
import { LowcodeAppsController } from './lowcode-apps.controller';
import { LowcodeAppsService } from './lowcode-apps.service';
import { PublicPublishedAppsController } from './public-published-apps.controller';
import { LowcodePagesService } from './lowcode-pages.service';
import { CollabEventsService } from './collab-events.service';
import { CollabSseController } from './collab-sse.controller';
import { PreviewTicket } from './preview-ticket.entity';
import { PreviewTicketsController } from './preview-tickets.controller';
import { PreviewTicketsService } from './preview-tickets.service';
import { ProjectRuntimeSecret } from './project-runtime-secret.entity';
import { ProjectRuntimeSecretsService } from './project-runtime-secrets.service';
import { ProjectRuntimeSetting } from './project-runtime-setting.entity';
import { ProjectRuntimeSettingsStoreService } from './project-runtime-settings-store.service';
import { RuntimeProxyController } from './runtime-proxy.controller';
import { RuntimeProxyService } from './runtime-proxy.service';
import { OrganizationModule } from '../tenants/organization.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LowcodeApp,
      LowcodePage,
      Category,
      AppHttpRequest,
      PreviewTicket,
      ProjectRuntimeSecret,
      ProjectRuntimeSetting,
      User,
    ]),
    AuthModule,
    HttpRequestsModule,
    OrganizationModule,
    AuditModule,
  ],
  controllers: [
    LowcodeAppsController,
    CollabSseController,
    PreviewTicketsController,
    PublicPublishedAppsController,
    RuntimeProxyController,
  ],
  providers: [
    LowcodeAppsService,
    LowcodePagesService,
    CollabEventsService,
    PreviewTicketsService,
    ProjectRuntimeSecretsService,
    ProjectRuntimeSettingsStoreService,
    RuntimeProxyService,
  ],
})
export class LowcodeAppsModule {}
