import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

type PgError = Error & {
  code?: string;
  detail?: string;
  constraint?: string;
  routine?: string;
  column?: string;
  table?: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        statusCode: status,
        message: exception.getResponse(),
      });
      return;
    }

    if (exception instanceof QueryFailedError) {
      const error = exception.driverError as PgError;
      this.logger.error(
        `PostgreSQL error ${error.code ?? 'unknown'}: ${error.message}`,
        error.detail,
      );
      const mapped = this.mapPgError(error);
      response.status(mapped.statusCode).json(mapped);
      return;
    }

    const message = exception instanceof Error ? exception.message : 'Internal server error';
    this.logger.error(message, exception instanceof Error ? exception.stack : undefined);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: process.env.NODE_ENV === 'development' ? message : 'Internal server error',
    });
  }

  private mapPgError(error: PgError) {
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
      return {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'rls_policy_violation',
        message: 'RLS policy denied this operation',
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
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      detail: process.env.NODE_ENV === 'development' ? error.detail : undefined,
    };
  }

  private humanizeUniqueViolation(error: PgError): string {
    const match = error.detail?.match(/\(([^)]+)\)=\(([^)]+)\)/);
    if (!match) {
      return 'A record with these values already exists';
    }
    return `${match[1]} '${match[2]}' already exists`;
  }
}
