import { randomUUID } from 'node:crypto';

import { NextFunction, Request, Response } from 'express';

import { RequestWithId } from './request-with-id';

export function requestIdMiddleware(
  request: Request & RequestWithId,
  response: Response,
  next: NextFunction,
): void {
  const headerValue = request.header('x-request-id');
  const requestId =
    typeof headerValue === 'string' && headerValue.trim().length > 0
      ? headerValue.trim()
      : `req_${randomUUID()}`;

  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
