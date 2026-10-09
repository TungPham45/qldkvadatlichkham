import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppException, ErrorCode } from './errors';
import { AccessTokenPayload, AppRoleValue } from './roles';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AppRoleValue[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AccessTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const token = value?.startsWith('Bearer ') ? value.slice(7) : undefined;
    if (!token) {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Bạn chưa đăng nhập.');
    }
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token);
      if (payload.type !== 'access') {
        throw new Error('wrong token type');
      }
      request.user = payload;
      return true;
    } catch {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AppRoleValue[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || !roles.includes(request.user.role)) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Bạn không có quyền thực hiện thao tác này.');
    }
    return true;
  }
}

@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['x-internal-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || token !== process.env.INTERNAL_TOKEN) {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Không được phép gọi API nội bộ.');
    }
    return true;
  }
}
