import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class GetStorageUrlDto {
  @IsString()
  @IsNotEmpty({ message: 'key 不能为空' })
  @Length(1, 2000)
  key: string;
}

export class DeleteStorageObjectDto {
  @IsString()
  @IsNotEmpty({ message: 'key 不能为空' })
  @Length(1, 2000)
  key: string;
}

export class UploadStorageQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  folder?: string;

  /** 素材分类 ID，与 folder 二选一；指定后文件写入该分类目录 */
  @IsOptional()
  @IsUUID('4', { message: 'categoryId 须为有效的 UUID' })
  categoryId?: string;
}

export class ListStorageQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** 子目录过滤，如 images */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  folder?: string;

  /** 素材分类 ID，与 folder 二选一 */
  @IsOptional()
  @IsUUID('4', { message: 'categoryId 须为有效的 UUID' })
  categoryId?: string;
}
