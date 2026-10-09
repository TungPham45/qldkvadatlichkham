import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccessTokenPayload } from './roles';
import { AuthenticatedRequest } from './guards';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessTokenPayload => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user as AccessTokenPayload;
});
