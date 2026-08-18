import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthPayload } from './auth.service';

export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthPayload | undefined,
    ctx: ExecutionContext,
  ): AuthPayload | AuthPayload[keyof AuthPayload] => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthPayload }>();
    const user = req.user;
    return data ? user[data] : user;
  },
);
