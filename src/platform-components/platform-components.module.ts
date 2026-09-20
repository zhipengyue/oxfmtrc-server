import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../tenants/organization.module';
import { AuditModule } from '../audit/audit.module';
import { User } from '../users/user.entity';
import { PlatformComponent } from './platform-component.entity';
import { PlatformComponentsController } from './platform-components.controller';
import { PlatformComponentsService } from './platform-components.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformComponent, User]),
    AuthModule,
    OrganizationModule,
    AuditModule,
  ],
  controllers: [PlatformComponentsController],
  providers: [PlatformComponentsService],
})
export class PlatformComponentsModule {}
