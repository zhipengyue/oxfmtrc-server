import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditResource } from '../audit-resource.enum';
import { AuditType } from '../audit-type.enum';

export class QueryAuditLogsDto {
  @IsOptional()
  @IsEnum(AuditType)
  type?: AuditType;

  @IsOptional()
  @IsEnum(AuditResource)
  resource?: AuditResource;

  @IsOptional()
  @IsString()
  actorPhone?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class QueryAuditStatsDto {
  @IsOptional()
  @IsString()
  range?: 'today' | '7d' | '30d';
}
