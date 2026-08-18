import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CreateHttpRequestDto,
  UpdateHttpRequestDto,
} from './dto/http-request.dto';
import { HttpRequestsService } from './http-requests.service';

@Controller('api/v1/apps/:appId/http-requests')
@UseGuards(AuthGuard('jwt'))
export class HttpRequestsController {
  constructor(private readonly httpRequestsService: HttpRequestsService) {}

  @Get()
  list(
    @Param('appId') appId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.httpRequestsService.list(appId, user);
  }

  @Post()
  create(
    @Param('appId') appId: string,
    @Body() dto: CreateHttpRequestDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.httpRequestsService.create(appId, dto, user);
  }

  @Get(':id')
  getById(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.httpRequestsService.getById(appId, id, user);
  }

  @Put(':id')
  update(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @Body() dto: UpdateHttpRequestDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.httpRequestsService.update(appId, id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.httpRequestsService.remove(appId, id, user);
  }
}
