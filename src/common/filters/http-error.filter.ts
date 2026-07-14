import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

import {
  ApplicationException,
  ErrorDetail,
} from '../errors/application.exception';
import { ErrorCode } from '../errors/error-codes';
import { RequestWithId } from '../logging/request-with-id';

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;

interface ErrorResponseBody {
  code?: ErrorCode;
  message?: string;
  details?: ErrorDetail[];
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & RequestWithId>();
    const normalized = this.normalizeException(exception);

    response.status(normalized.statusCode).json({
      statusCode: normalized.statusCode,
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        path: request.originalUrl || request.url,
      },
    });
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    code: ErrorCode;
    message: string;
    details: ErrorDetail[];
  } {
    if (exception instanceof ApplicationException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: this.extractMessage(exception),
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      if (statusCode === HTTP_NOT_FOUND) {
        return {
          statusCode,
          code: 'ROUTE_NOT_FOUND',
          message: 'Route not found.',
          details: [],
        };
      }

      const body = exception.getResponse();
      const bodyObject =
        typeof body === 'object' ? (body as ErrorResponseBody) : undefined;

      return {
        statusCode,
        code: this.defaultCodeForStatus(statusCode),
        message:
          bodyObject?.message ??
          (typeof body === 'string' ? body : exception.message),
        details: bodyObject?.details ?? [],
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server failure.',
      details: [],
    };
  }

  private extractMessage(exception: ApplicationException): string {
    const body = exception.getResponse();
    if (typeof body === 'object' && 'message' in body) {
      return String(body.message);
    }
    return exception.message;
  }

  private defaultCodeForStatus(statusCode: number): ErrorCode {
    if (statusCode === HTTP_UNAUTHORIZED) {
      return 'UNAUTHENTICATED';
    }
    if (statusCode === HTTP_FORBIDDEN) {
      return 'FORBIDDEN';
    }
    if (statusCode === HTTP_SERVICE_UNAVAILABLE) {
      return 'SERVICE_NOT_READY';
    }
    return statusCode >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
  }
}
