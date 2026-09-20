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

  @Get('market/scope/:scope')
  listMarketScope(
    @CurrentUser() user: AuthPayload,
    @Param('scope') scope: string,
  ) {
    return this.service.listMarketScope(user, scope);
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
    return this.service.publish(user, id, dto.visibility);
  }

  @Post(':id/unpublish')
  unpublish(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.service.unpublish(user, id);
  }

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
