import { IsOptional, IsString } from 'class-validator';

export class PublishAppDto {
  @IsOptional()
  @IsString()
  note?: string;
}
