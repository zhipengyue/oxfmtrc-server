import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaterialCategoriesModule } from '../material-categories/material-categories.module';
import { MinioService } from './minio.service';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [AuthModule, forwardRef(() => MaterialCategoriesModule)],
  controllers: [StorageController],
  providers: [MinioService, StorageService],
  exports: [StorageService, MinioService],
})
export class StorageModule {}
