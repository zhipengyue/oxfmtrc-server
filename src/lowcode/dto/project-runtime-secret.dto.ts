import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveProjectRuntimeSecretDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
