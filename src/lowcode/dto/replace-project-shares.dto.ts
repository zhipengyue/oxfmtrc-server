import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { ProjectSharePermission } from '../project-share-permission.enum';

export class ProjectShareItemDto {
  @IsString()
  @Length(1, 64)
  memberPhone: string;

  @IsEnum(ProjectSharePermission, { message: 'permission 须为 view 或 edit' })
  permission: ProjectSharePermission;
}

export class ReplaceProjectSharesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectShareItemDto)
  @ArrayUnique((item: ProjectShareItemDto) => item.memberPhone)
  shares: ProjectShareItemDto[];
}
