import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreatePageDto {
  @IsOptional()
  @IsString()
  @Length(1, 200, { message: '页面名称长度为 1–200 个字符' })
  name?: string;
}

export class RenamePageDto {
  @IsString()
  @IsNotEmpty({ message: '页面名称不能为空' })
  @Length(1, 200, { message: '页面名称长度为 1–200 个字符' })
  name: string;
}

export class ReorderPagesDto {
  /** 拖拽后的完整页面 id 顺序（须包含该应用下全部页面） */
  @IsArray()
  @IsUUID('4', { each: true, message: 'pageIds 须为有效的页面 UUID' })
  pageIds: string[];
}

export class SavePageDetailDto {
  /** 页面布局 LayoutRoot：至少含 nodes 数组，可选 props */
  @IsObject({ message: 'detail 须为 JSON 对象' })
  detail: Record<string, unknown>;
}
