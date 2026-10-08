import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { PublishComponentDto } from './dto/publish-component.dto';
import { PlatformComponent } from './platform-component.entity';
import { PlatformComponentsService } from './platform-components.service';

@Controller('api/v1/platform-components')
@UseGuards(AuthGuard('jwt'))
export class PlatformComponentsController {
  constructor(private readonly service: PlatformComponentsService) {}

  @Get('mine')
  listMine(@CurrentUser() user: AuthPayload) {
    return this.service.listMine(user);
  }

  @Get('market')
  listMarket(@CurrentUser() user: AuthPayload) {
    return this.service.listMarket(user);
  }

  @Get('withdrawn')
  withdrawn(@CurrentUser() user: AuthPayload) { return this.service.listWithdrawn(user); }

  @Get('market/scope/:scope')
  listMarketScope(
    @CurrentUser() user: AuthPayload,
    @Param('scope') scope: string,
  ) {
    return this.service.listMarketScope(user, scope);
  }

  @Get('market/:id/versions')
  listMarketVersions(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
  ) {
    return this.service.listMarketVersions(user, id);
  }

  @Post('market/:id/use')
  useFromMarket(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
  ) {
    return this.service.useFromMarket(user, id);
  }

  @Get()
  list(@CurrentUser() user: AuthPayload) {
    return this.service.list(user);
  }

  @Post()
  save(
    @CurrentUser() user: AuthPayload,
    @Body() body: Partial<PlatformComponent>,
  ) {
    return this.service.save(user, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Body() body: Partial<PlatformComponent>,
  ) {
    return this.service.save(user, { ...body, id });
  }

  @Post(':id/publish')
  publish(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Body() dto: PublishComponentDto,
  ) {
    return this.service.publish(user, id, dto.visibility, dto.categoryId);
  }

  @Get('official-categories')
  categories() { return this.service.listOfficialCategories(); }
  @Post('official-categories')
  createCategory(@CurrentUser() user: AuthPayload, @Body() body: { name?: string }) { return this.service.createOfficialCategory(user, body.name); }
  @Put('official-categories/:categoryId')
  updateCategory(@CurrentUser() user: AuthPayload, @Param('categoryId') categoryId: string, @Body() body: { name?: string }) { return this.service.updateOfficialCategory(user, categoryId, body.name); }
  @Delete('official-categories/:categoryId')
  removeCategory(@CurrentUser() user: AuthPayload, @Param('categoryId') categoryId: string) { return this.service.removeOfficialCategory(user, categoryId); }

  @Post(':id/unpublish')
  unpublish(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.service.unpublish(user, id);
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: AuthPayload, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.withdraw(user, id, body.reason);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthPayload, @Param('id') id: string) { return this.service.restore(user, id); }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentDelete(@CurrentUser() user: AuthPayload, @Param('id') id: string) { return this.service.deleteWithdrawn(user, id); }

  @Patch(':id/status')
  status(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Body() body: { status: 'published' | 'unpublished' },
  ) {
    return this.service.setStatus(
      user,
      id,
      body.status === 'published' ? 'published' : 'unpublished',
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
