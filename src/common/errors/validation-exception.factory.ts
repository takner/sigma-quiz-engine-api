import { HttpStatus } from '@nestjs/common';
import { ValidationError } from 'class-validator';

import { ApplicationException, ErrorDetail } from './application.exception';

export function createValidationException(
  errors: ValidationError[],
): ApplicationException {
  const details = flattenValidationErrors(errors);
  const hasUnknownProperty = errors.some(hasWhitelistError);

  return new ApplicationException(
    HttpStatus.BAD_REQUEST,
    hasUnknownProperty ? 'VALIDATION_ERROR' : 'VALIDATION_FAILED',
    hasUnknownProperty
      ? 'The request contains unknown or forbidden properties.'
      : 'Request validation failed.',
    details,
  );
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const ownIssues = Object.values(error.constraints ?? {}).map((issue) => ({
      field,
      issue,
    }));
    return [
      ...ownIssues,
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}

function hasWhitelistError(error: ValidationError): boolean {
  return (
    Object.prototype.hasOwnProperty.call(
      error.constraints ?? {},
      'whitelistValidation',
    ) || (error.children ?? []).some(hasWhitelistError)
  );
}
