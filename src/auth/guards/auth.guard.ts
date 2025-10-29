import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // Always try to extract user if token exists
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const result = await this.authService.validateToken(token);
        if (result.valid) {
          request.user = result.user;
          console.log('✅ [AUTH] User authenticated:', request.user.uid);
        } else {
          console.log('❌ [AUTH] Token validation failed');
        }
      } catch (error) {
        // Silently fail for optional auth
        console.log('⚠️ [AUTH] Invalid token provided:', error.message);
      }
    } else {
      console.log('📭 [AUTH] No auth header provided');
    }

    if (isPublic) {
      return true; // Allow access even without valid token
    }

    // For protected routes, require valid user
    if (!request.user) {
      throw new UnauthorizedException('Authentication required');
    }

    return true;
  }
}

