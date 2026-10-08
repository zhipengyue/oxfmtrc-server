import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateMemberDto } from './dto/create-member.dto';
import { TransferAdminDto } from './dto/transfer-admin.dto';
import { OrganizationService } from './organization.service';

@Controller('api/v1/organization')
@UseGuards(AuthGuard('jwt'))
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}
  @Get('tenants') listTenants(@CurrentUser() user: AuthPayload) { return this.service.listTenants(user); }
  @Get('members') listMembers(@CurrentUser() user: AuthPayload, @Query('tenantId') tenantId?: string) { return this.service.listMembers(user, tenantId); }
  @Post('members') createMember(@CurrentUser() user: AuthPayload, @Body() dto: CreateMemberDto) { return this.service.createMember(user, dto); }
  @Patch('members/:id/enabled') setEnabled(@CurrentUser() user: AuthPayload, @Param('id') id: string, @Body() body: { enabled: boolean }) { return this.service.setMemberEnabled(user, id, Boolean(body.enabled)); }
  @Post('transfer-admin')
  transferAdmin(@CurrentUser() user: AuthPayload, @Body() dto: TransferAdminDto) {
    return this.service.transferAdmin(user, dto);
  }
}
