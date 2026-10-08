import { IsObject } from 'class-validator';

export class CreatePreviewTicketDto {
  @IsObject()
  snapshot: Record<string, unknown>;
}
