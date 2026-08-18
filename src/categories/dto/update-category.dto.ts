import { IsNotEmpty, IsString, Length } from 'class-validator';

export class UpdateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: '分类名称不能为空' })
  @Length(1, 100, { message: '分类名称长度为 1–100 个字符' })
  name: string;
}
