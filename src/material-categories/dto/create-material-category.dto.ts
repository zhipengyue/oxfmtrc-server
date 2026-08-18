import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateMaterialCategoryDto {
  @IsString()
  @IsNotEmpty({ message: '分类名称不能为空' })
  @Length(1, 100)
  name: string;
}
