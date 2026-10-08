import { IsObject } from 'class-validator';

export class SaveRuntimeSettingsDto {
  @IsObject()
  settings: Record<string, unknown>;
}
