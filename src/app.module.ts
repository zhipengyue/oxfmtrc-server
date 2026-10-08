import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { RefreshToken } from './auth/refresh-token.entity';
import { CategoriesModule } from './categories/categories.module';
import { Category } from './categories/category.entity';
import { AppHttpRequest } from './http-requests/http-request.entity';
import { HttpRequestsModule } from './http-requests/http-requests.module';
import { LowcodeApp } from './lowcode/lowcode-app.entity';
import { LowcodePage } from './lowcode/lowcode-page.entity';
import { LowcodeAppsModule } from './lowcode/lowcode-apps.module';
import { PreviewTicket } from './lowcode/preview-ticket.entity';
import { ProjectRuntimeSecret } from './lowcode/project-runtime-secret.entity';
import { ProjectRuntimeSetting } from './lowcode/project-runtime-setting.entity';
import { MaterialCategoriesModule } from './material-categories/material-categories.module';
import { MaterialCategory } from './material-categories/material-category.entity';
import { StorageModule } from './storage/storage.module';
import { User } from './users/user.entity';
import { Tenant } from './tenants/tenant.entity';
import { OrganizationModule } from './tenants/organization.module';
import { PlatformComponentsModule } from './platform-components/platform-components.module';
import { PlatformComponent } from './platform-components/platform-component.entity';
import { PlatformComponentCategory } from './platform-components/platform-component-category.entity';
import { ProjectShare } from './lowcode/project-share.entity';
import { AuditLog } from './audit/audit-log.entity';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: parseInt(config.get<string>('DB_PORT', '3306'), 10),
        username: config.get<string>('DB_USERNAME', 'root'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_DATABASE', 'oxfmtrc'),
        entities: [
          User,
          Tenant,
          PlatformComponent,
          PlatformComponentCategory,
          LowcodeApp,
          LowcodePage,
          Category,
          MaterialCategory,
          RefreshToken,
          AppHttpRequest,
          PreviewTicket,
          ProjectRuntimeSecret,
          ProjectRuntimeSetting,
          ProjectShare,
          AuditLog,
        ],
        synchronize: process.env.NODE_ENV !== 'production',
        logging: process.env.DB_LOGGING === 'true',
      }),
    }),
    AuthModule,
    AuditModule,
    LowcodeAppsModule,
    CategoriesModule,
    HttpRequestsModule,
    StorageModule,
    MaterialCategoriesModule,
    OrganizationModule,
    PlatformComponentsModule,
  ],
})
export class AppModule {}
