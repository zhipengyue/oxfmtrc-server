import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateAppDto } from './dto/create-app.dto';
import { CopyAppDto } from './dto/copy-app.dto';
import { CreatePageDto, RenamePageDto, ReorderPagesDto, SavePageDetailDto } from './dto/page.dto';
import { LowcodeAppsService } from './lowcode-apps.service';
import { LowcodePagesService } from './lowcode-pages.service';

@Controller('api/v1/apps')
@UseGuards(AuthGuard('jwt'))
export class LowcodeAppsController {
  constructor(
    private readonly appsService: LowcodeAppsService,
    private readonly pagesService: LowcodePagesService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthPayload) {
    return this.appsService.listForOwner(user);
  }

  @Post()
  create(@Body() dto: CreateAppDto, @CurrentUser() user: AuthPayload) {
    return this.appsService.create(dto, user);
  }

  @Post(':appId/copy')
  copy(
    @Param('appId') appId: string,
    @Body() dto: CopyAppDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.copy(appId, dto, user);
  }

  @Get(':appId/draft')
  getDraft(
    @Param('appId') appId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.getDraft(appId, user);
  }

  @Put(':appId/pages/order')
  reorderPages(
    @Param('appId') appId: string,
    @Body() dto: ReorderPagesDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.pagesService.reorderPages(appId, dto, user);
  }

  @Post(':appId/pages')
  createPage(
    @Param('appId') appId: string,
    @Body() dto: CreatePageDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.pagesService.createPage(appId, dto, user);
  }

  @Put(':appId/pages/:pageId/detail')
  savePageDetail(
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
    @Body() dto: SavePageDetailDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.pagesService.savePageDetail(appId, pageId, dto, user);
  }

  @Put(':appId/pages/:pageId')
  renamePage(
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
    @Body() dto: RenamePageDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.pagesService.renamePage(appId, pageId, dto, user);
  }

  @Delete(':appId/pages/:pageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePage(
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.pagesService.deletePage(appId, pageId, user);
  }

  @Get(':appId/pages/:pageId')
  getPageDetail(
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.getPageDetail(appId, pageId, user);
  }

  @Get(':appId')
  getAppDetail(
    @Param('appId') appId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.getAppDetail(appId, user);
  }
}
