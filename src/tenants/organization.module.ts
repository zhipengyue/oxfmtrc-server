import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { User } from '../users/user.entity';
import { ProjectShare } from '../lowcode/project-share.entity';
import { OrganizationController } from './organization.controller';
import { PublicTenantsController } from './public-tenants.controller';
import { OrganizationService } from './organization.service';
import { Tenant } from './tenant.entity';
import { AccessScopeService } from './access-scope.service';
import { ProjectAccessService } from './project-access.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, User, ProjectShare]),
    AuthModule,
    forwardRef(() => AuditModule),
  ],
  controllers: [OrganizationController, PublicTenantsController],
  providers: [OrganizationService, AccessScopeService, ProjectAccessService],
  exports: [OrganizationService, AccessScopeService, ProjectAccessService],
})
export class OrganizationModule {}
