import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

type PgError = Error & {
  code?: string;
  detail?: string;
  constraint?: string;
  routine?: string;
  column?: string;
  table?: string;
};

type RequestDetails = {
  method?: string;
  originalUrl?: string;
  url?: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestDetails>();
    const context = {
      method: request.method,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const defaultBody =
        typeof body === 'object' && body !== null
          ? (body as { error?: string; message?: string | string[] })
          : undefined;
      const isMissingRoute =
        status === Number(HttpStatus.NOT_FOUND) &&
        typeof defaultBody?.message === 'string' &&
        defaultBody.message.startsWith('Cannot ');
      response.status(status).json({
        statusCode: status,
        error: isMissingRoute
          ? 'route_not_found'
          : this.httpErrorCode(status, defaultBody?.error),
        message: isMissingRoute
          ? `API route ${context.method ?? ''} ${context.path ?? ''} was not found.`.trim()
          : (defaultBody?.message ?? body),
        ...context,
      });
      return;
    }

    if (exception instanceof QueryFailedError) {
      const error = exception.driverError as unknown as PgError;
      this.logger.error(
        `PostgreSQL error ${error.code ?? 'unknown'}: ${error.message}`,
        error.detail,
      );
      const mapped = this.mapPgError(error, request);
      response.status(mapped.statusCode).json({ ...mapped, ...context });
      return;
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';
    this.logger.error(
      message,
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'internal_server_error',
      message:
        process.env.NODE_ENV === 'development'
          ? message
          : 'Internal server error',
      ...context,
    });
  }

  private mapPgError(error: PgError, request: RequestDetails) {
    if (error.code === 'P0001') {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'conflict',
        message: error.message,
      };
    }
    if (error.code === '23505') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'unique_violation',
        message: this.humanizeUniqueViolation(error),
      };
    }
    if (error.code === '23502') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'not_null_violation',
        message: error.column ? `${error.column} is required` : error.message,
        detail: error.detail,
      };
    }
    if (error.code === '22P02') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'invalid_text_representation',
        message: error.message,
        detail: error.detail,
      };
    }
    if (
      error.code === '42501' ||
      error.message?.toLowerCase().includes('row-level security')
    ) {
      const action = this.actionForMethod(request.method);
      const resource = this.resourceForPath(request.originalUrl ?? request.url);
      return {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'rls_policy_violation',
        message: `You do not have permission to ${action} this ${resource}.`,
      };
    }
    if (error.code === '23503') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'foreign_key_violation',
        message: error.detail,
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: error.code,
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Internal server error',
      detail: process.env.NODE_ENV === 'development' ? error.detail : undefined,
    };
  }

  private humanizeUniqueViolation(error: PgError): string {
    if (error.constraint === 'board_members_unique') {
      return 'This user is already a member of the board';
    }
    const match = error.detail?.match(/\(([^)]+)\)=\(([^)]+)\)/);
    if (!match) {
      return 'A record with these values already exists';
    }
    return `${match[1]} '${match[2]}' already exists`;
  }

  private httpErrorCode(status: number, fallback?: string) {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'bad_request',
      [HttpStatus.UNAUTHORIZED]: 'unauthorized',
      [HttpStatus.FORBIDDEN]: 'forbidden',
      [HttpStatus.NOT_FOUND]: 'not_found',
      [HttpStatus.CONFLICT]: 'conflict',
    };
    return (
      codes[status] ??
      fallback?.toLowerCase().replace(/\s+/g, '_') ??
      'http_error'
    );
  }

  private actionForMethod(method?: string) {
    const actions: Record<string, string> = {
      GET: 'view',
      POST: 'create',
      PUT: 'update',
      PATCH: 'update',
      DELETE: 'delete',
    };
    return actions[method ?? ''] ?? 'access';
  }

  private resourceForPath(path?: string) {
    if (path?.includes('/members')) return 'board membership';
    if (path?.includes('/notes')) return 'note';
    if (path?.includes('/boards')) return 'board';
    if (path?.includes('/users')) return 'user';
    return 'resource';
  }
}
