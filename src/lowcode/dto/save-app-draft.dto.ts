import { IsObject } from 'class-validator';

export class SaveAppDraftDto {
  @IsObject()
  snapshot: Record<string, unknown>;
}
