import { IsString } from 'class-validator';

export class SetDefaultPublishedDto {
  @IsString()
  version: string;
}