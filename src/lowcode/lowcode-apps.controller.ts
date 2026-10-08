import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import type { AuthPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateAppDto } from './dto/create-app.dto';
import { CopyAppDto } from './dto/copy-app.dto';
import { CreatePageDto, RenamePageDto, ReorderPagesDto, SavePageDetailDto } from './dto/page.dto';
import { LowcodeAppsService } from './lowcode-apps.service';
import { LowcodePagesService } from './lowcode-pages.service';
import { CreatePreviewTicketDto } from './dto/create-preview-ticket.dto';
import { SaveAppDraftDto } from './dto/save-app-draft.dto';
import { SaveAppCoverDto } from './dto/save-app-cover.dto';
import { PublishAppDto } from './dto/publish-app.dto';
import { SetDefaultPublishedDto } from './dto/set-default-published.dto';
import { PreviewTicketsService } from './preview-tickets.service';
import { buildOfflinePackage } from './offline-package.util';
import { SaveProjectRuntimeSecretDto } from './dto/project-runtime-secret.dto';
import { ProjectRuntimeSecretsService } from './project-runtime-secrets.service';
import { SaveRuntimeSettingsDto } from './dto/save-runtime-settings.dto';
import { ProjectRuntimeSettingsStoreService } from './project-runtime-settings-store.service';
import { UpdateProjectVisibilityDto } from './dto/update-project-visibility.dto';
import { ReplaceProjectSharesDto } from './dto/replace-project-shares.dto';
import { UpdateAppDto } from './dto/update-app.dto';

@Controller('api/v1/apps')
@UseGuards(AuthGuard('jwt'))
export class LowcodeAppsController {
  constructor(
    private readonly appsService: LowcodeAppsService,
    private readonly pagesService: LowcodePagesService,
    private readonly previewTickets: PreviewTicketsService,
    private readonly runtimeSecrets: ProjectRuntimeSecretsService,
    private readonly runtimeSettingsStore: ProjectRuntimeSettingsStoreService,
  ) {}

  @Get(':appId/runtime-secrets')
  listRuntimeSecrets(@Param('appId') appId: string, @CurrentUser() user: AuthPayload) {
    return this.runtimeSecrets.list(appId, user);
  }

  @Put(':appId/runtime-secrets/:name')
  saveRuntimeSecret(
    @Param('appId') appId: string,
    @Param('name') name: string,
    @Body() dto: SaveProjectRuntimeSecretDto,
    @CurrentUser() user: AuthPayload,
  ) {
    const normalized = name.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,99}$/.test(normalized)) throw new BadRequestException('密钥名称格式无效');
    return this.runtimeSecrets.save(appId, normalized, dto.value, dto.note ?? '', user);
  }

  @Delete(':appId/runtime-secrets/:name')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRuntimeSecret(
    @Param('appId') appId: string,
    @Param('name') name: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.runtimeSecrets.remove(appId, name.trim().toUpperCase(), user);
  }

  @Post(':appId/preview-ticket')
  createPreviewTicket(
    @Param('appId') appId: string,
    @Body() dto: CreatePreviewTicketDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.previewTickets.create(appId, dto.snapshot, user);
  }

  @Get()
  list(@CurrentUser() user: AuthPayload) {
    return this.appsService.listForOwner(user);
  }

  @Put(':appId/visibility')
  updateVisibility(
    @Param('appId') appId: string,
    @Body() dto: UpdateProjectVisibilityDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.updateVisibility(appId, dto.visibility, user);
  }

  @Get(':appId/shares')
  listShares(@Param('appId') appId: string, @CurrentUser() user: AuthPayload) {
    return this.appsService.listShares(appId, user);
  }

  @Put(':appId/shares')
  replaceShares(
    @Param('appId') appId: string,
    @Body() dto: ReplaceProjectSharesDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.replaceShares(appId, dto.shares, user);
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

  @Put(':appId/meta')
  updateMeta(
    @Param('appId') appId: string,
    @Body() dto: UpdateAppDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.updateMeta(appId, dto, user);
  }

  @Get(':appId/draft')
  getDraft(
    @Param('appId') appId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.getDraft(appId, user);
  }

  @Put(':appId/draft')
  saveDraft(
    @Param('appId') appId: string,
    @Body() dto: SaveAppDraftDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.saveDraft(appId, dto.snapshot, user);
  }

  @Put(':appId/cover')
  saveCover(
    @Param('appId') appId: string,
    @Body() dto: SaveAppCoverDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.saveCover(appId, dto.coverDataUrl, user);
  }

  @Put(':appId/runtime-settings')
  saveRuntimeSettings(
    @Param('appId') appId: string,
    @Body() dto: SaveRuntimeSettingsDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.runtimeSettingsStore.save(appId, dto.settings, user);
  }

  @Get(':appId/runtime-settings')
  getRuntimeSettings(
    @Param('appId') appId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.runtimeSettingsStore.get(appId, user);
  }

  @Post(':appId/publish')
  publish(
    @Param('appId') appId: string,
    @Body() dto: PublishAppDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.publish(appId, dto.note ?? '', user);
  }

  @Post(':appId/offline-package')
  async exportOfflinePackage(
    @Param('appId') appId: string,
    @CurrentUser() user: AuthPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const snapshot = await this.appsService.getDraft(appId, user);
    const runtimeSettings = await this.runtimeSettingsStore.get(appId, user);
    const archive = await buildOfflinePackage({ ...snapshot, runtimeSettings });
    response.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${appId}-offline.zip"`,
      'Content-Length': String(archive.length),
    });
    return new StreamableFile(archive);
  }

  @Post(':appId/published/default')
  setDefaultPublished(
    @Param('appId') appId: string,
    @Body() dto: SetDefaultPublishedDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.setDefaultPublished(appId, dto.version, user);
  }

  @Delete(':appId/published/:version')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePublishedVersion(
    @Param('appId') appId: string,
    @Param('version') version: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.removePublishedVersion(appId, version, user);
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

  @Delete(':appId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeApp(
    @Param('appId') appId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.appsService.remove(appId, user);
  }
}
