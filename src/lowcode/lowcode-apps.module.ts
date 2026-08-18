import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { HttpRequestsModule } from '../http-requests/http-requests.module';
import { Category } from '../categories/category.entity';
import { AppHttpRequest } from '../http-requests/http-request.entity';
import { LowcodeApp } from './lowcode-app.entity';
import { LowcodePage } from './lowcode-page.entity';
import { LowcodeAppsController } from './lowcode-apps.controller';
import { LowcodeAppsService } from './lowcode-apps.service';
import { LowcodePagesService } from './lowcode-pages.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LowcodeApp, LowcodePage, Category, AppHttpRequest]),
    AuthModule,
    HttpRequestsModule,
  ],
  controllers: [LowcodeAppsController],
  providers: [LowcodeAppsService, LowcodePagesService],
})
export class LowcodeAppsModule {}
