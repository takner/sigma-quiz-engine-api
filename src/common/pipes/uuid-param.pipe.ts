import {
  ArgumentMetadata,
  HttpStatus,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

import { ApplicationException } from '../errors/application.exception';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (UUID_PATTERN.test(value)) {
      return value;
    }

    const field = metadata.data ?? 'id';
    throw new ApplicationException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      'Request validation failed.',
      [{ field, issue: 'must be a valid UUID' }],
    );
  }
}
