import { Controller, Get, Param } from '@nestjs/common';
import { PreviewTicketsService } from './preview-tickets.service';

@Controller('api/v1/app-previews')
export class PreviewTicketsController {
  constructor(private readonly previews: PreviewTicketsService) {}

  @Get(':ticket')
  resolve(@Param('ticket') ticket: string) {
    return this.previews.resolve(ticket);
  }
}
