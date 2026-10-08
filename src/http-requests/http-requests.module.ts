import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { LowcodeApp } from '../lowcode/lowcode-app.entity';
import { AppHttpRequest } from './http-request.entity';
import { HttpRequestsController } from './http-requests.controller';
import { HttpRequestsService } from './http-requests.service';
import { OrganizationModule } from '../tenants/organization.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppHttpRequest, LowcodeApp]),
    OrganizationModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [HttpRequestsController],
  providers: [HttpRequestsService],
  exports: [HttpRequestsService],
})
export class HttpRequestsModule {}
