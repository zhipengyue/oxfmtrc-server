import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { AppLayoutType } from '../app-layout-type.enum';
import { CanvasLayoutMode } from '../canvas-layout-mode.enum';

export class CreateAppDto {
  @IsString()
  @IsNotEmpty({ message: '应用名称不能为空' })
  @Length(1, 200)
  name: string;

  @IsUUID('4', { message: '请选择有效的应用分类' })
  categoryId: string;

  /** 布局类型：web（Web 端）/ mobile（移动端） */
  @IsEnum(AppLayoutType, { message: '布局类型须为 web 或 mobile' })
  primaryLayout: AppLayoutType;

  /** Web 画布布局：relative（相对）/ absolute（绝对）；mobile 应用忽略并固定 relative */
  @IsOptional()
  @IsEnum(CanvasLayoutMode, {
    message: 'canvasLayoutMode must be relative or absolute',
  })
  canvasLayoutMode?: CanvasLayoutMode;
}
