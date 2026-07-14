import { HttpStatus } from '@nestjs/common';

import { ApplicationException } from '../errors/application.exception';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export function parsePagination(query: {
  page?: string;
  limit?: string;
}): PaginationParams {
  const page = parseOptionalPositiveInteger(query.page, 1);
  const limit = parseOptionalPositiveInteger(query.limit, 20);

  if (limit > 100) {
    throw new ApplicationException(
      HttpStatus.BAD_REQUEST,
      'INVALID_PAGINATION',
      'Pagination limit must be between 1 and 100.',
      [{ field: 'limit', issue: 'must be less than or equal to 100' }],
    );
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function paginate<T>(
  data: T[],
  totalItems: number,
  params: PaginationParams,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(totalItems / params.limit);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPreviousPage: params.page > 1,
    },
  };
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  defaultValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new ApplicationException(
      HttpStatus.BAD_REQUEST,
      'INVALID_PAGINATION',
      'Pagination parameters must be positive integers.',
    );
  }

  return Number.parseInt(value, 10);
}
