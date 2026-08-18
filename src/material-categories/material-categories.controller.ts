import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateMaterialCategoryDto } from './dto/create-material-category.dto';
import { MaterialCategoriesService } from './material-categories.service';

@Controller('api/v1/material-categories')
@UseGuards(AuthGuard('jwt'))
export class MaterialCategoriesController {
  constructor(
    private readonly materialCategoriesService: MaterialCategoriesService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthPayload) {
    return this.materialCategoriesService.list(user);
  }

  @Post()
  create(
    @Body() dto: CreateMaterialCategoryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.materialCategoriesService.create(dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: AuthPayload) {
    return this.materialCategoriesService.remove(id, user);
  }
}
