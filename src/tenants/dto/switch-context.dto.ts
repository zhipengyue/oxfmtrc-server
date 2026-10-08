import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SwitchContextDto {
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsString() userId?: string;
}
