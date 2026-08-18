import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';

export class CopyAppDto {
  @IsString()
  @IsNotEmpty({ message: '应用名称不能为空' })
  @Length(1, 200)
  name: string;

  @IsUUID('4', { message: '请选择有效的应用分类' })
  categoryId: string;
}
