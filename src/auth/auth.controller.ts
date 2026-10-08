import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { AuthPayload } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { SwitchContextDto } from '../tenants/dto/switch-context.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterEnterpriseDto } from './dto/register-enterprise.dto';
import { RegisterPersonalDto } from './dto/register-personal.dto';

function clientMeta(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : '') ||
    req.ip ||
    req.socket.remoteAddress ||
    '';
  const userAgent = String(req.headers['user-agent'] ?? '').slice(0, 300);
  return { ip: ip.slice(0, 64), userAgent };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/personal')
  registerPersonal(@Body() dto: RegisterPersonalDto) {
    return this.authService.registerPersonal(dto);
  }

  @Post('register/enterprise')
  registerEnterprise(@Body() dto: RegisterEnterpriseDto) {
    return this.authService.registerEnterprise(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, clientMeta(req));
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('switch-context')
  @UseGuards(AuthGuard('jwt'))
  switchContext(@CurrentUser() user: AuthPayload, @Body() dto: SwitchContextDto) {
    return this.authService.switchContext(user, dto);
  }
}
