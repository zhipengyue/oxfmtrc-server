import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { MaterialCategoriesController } from './material-categories.controller';
import { MaterialCategory } from './material-category.entity';
import { MaterialCategoriesService } from './material-categories.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaterialCategory]),
    AuthModule,
    forwardRef(() => StorageModule),
  ],
  controllers: [MaterialCategoriesController],
  providers: [MaterialCategoriesService],
  exports: [MaterialCategoriesService],
})
export class MaterialCategoriesModule {}
