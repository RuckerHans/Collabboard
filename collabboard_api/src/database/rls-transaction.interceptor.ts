import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, lastValueFrom } from 'rxjs';
import { DatabaseService } from './database.service';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

type RequestWithUser = {
  user?: { id?: string; sub?: string };
  method?: string;
};

@Injectable()
export class RlsTransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      if (isPublic || request.method === 'GET') {
        return next.handle();
      }
      throw new UnauthorizedException(
        'Authentication required for RLS transaction',
      );
    }

    return from(
      this.db.runInRlsTransaction(userId, () => lastValueFrom(next.handle())),
    );
  }
}
