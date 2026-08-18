import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AuthPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  DeleteStorageObjectDto,
  GetStorageUrlDto,
  ListStorageQueryDto,
  UploadStorageQueryDto,
} from './dto/storage.dto';
import { MaterialCategoriesService } from '../material-categories/material-categories.service';
import { StorageService } from './storage.service';

@Controller('api/v1/storage')
@UseGuards(AuthGuard('jwt'))
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly materialCategoriesService: MaterialCategoriesService,
  ) {}

  /** 资源列表（当前用户上传的文件） */
  @Get('list')
  async list(@Query() query: ListStorageQueryDto, @CurrentUser() user: AuthPayload) {
    const folder = await this.resolveFolder(user, query.folder, query.categoryId);
    return this.storageService.list(
      user,
      query.page ?? 1,
      query.pageSize ?? 20,
      folder,
    );
  }

  /** 上传文件到 MinIO */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query() query: UploadStorageQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    const folder = await this.resolveFolder(user, query.folder, query.categoryId);
    return this.storageService.upload(user, file, folder);
  }

  /** 获取文件访问 URL（预签名或公开 URL） */
  @Get('url')
  getUrl(@Query() query: GetStorageUrlDto, @CurrentUser() user: AuthPayload) {
    return this.storageService.getAccessUrl(user, query.key.trim());
  }

  /** 删除文件 */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Query() query: DeleteStorageObjectDto, @CurrentUser() user: AuthPayload) {
    return this.storageService.remove(user, query.key.trim());
  }

  private async resolveFolder(
    user: AuthPayload,
    folder?: string,
    categoryId?: string,
  ): Promise<string | undefined> {
    if (folder && categoryId) {
      throw new BadRequestException('folder 与 categoryId 不能同时指定');
    }
    if (categoryId) {
      return this.materialCategoriesService.resolveFolderByCategoryId(user, categoryId);
    }
    return folder;
  }
}
