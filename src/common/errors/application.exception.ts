import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode } from './error-codes';

export interface ErrorDetail {
  field?: string;
  issue: string;
}

export class ApplicationException extends HttpException {
  constructor(
    statusCode: HttpStatus,
    public readonly code: ErrorCode,
    message: string,
    public readonly details: ErrorDetail[] = [],
  ) {
    super({ code, message, details }, statusCode);
  }
}
