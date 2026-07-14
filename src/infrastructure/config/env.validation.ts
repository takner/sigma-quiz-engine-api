export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentConfig {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  CORS_ORIGINS: string[];
  JWT_SECRET: string;
  JWT_EXPIRES_IN: number;
}

const DEVELOPMENT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function validateEnvironment(
  values: Record<string, unknown>,
): EnvironmentConfig {
  const nodeEnvironment = parseNodeEnvironment(values.NODE_ENV);
  const corsOrigins = parseCorsOrigins(values.CORS_ORIGINS, nodeEnvironment);

  return {
    NODE_ENV: nodeEnvironment,
    PORT: parsePort(values.PORT),
    DATABASE_URL: parseDatabaseUrl(values.DATABASE_URL),
    CORS_ORIGINS: corsOrigins,
    JWT_SECRET: parseRequiredString(values.JWT_SECRET, 'JWT_SECRET'),
    JWT_EXPIRES_IN: parsePositiveInteger(
      values.JWT_EXPIRES_IN,
      'JWT_EXPIRES_IN',
      3600,
    ),
  };
}

function parseNodeEnvironment(value: unknown): NodeEnvironment {
  const parsed = typeof value === 'string' ? value : 'development';
  if (
    parsed === 'development' ||
    parsed === 'test' ||
    parsed === 'production'
  ) {
    return parsed;
  }
  throw new Error('NODE_ENV must be one of development, test, or production.');
}

function parsePort(value: unknown): number {
  const port = parsePositiveInteger(value, 'PORT', 3000);
  if (port > 65535) {
    throw new Error('PORT must be less than or equal to 65535.');
  }
  return port;
}

function parseDatabaseUrl(value: unknown): string {
  const databaseUrl = parseRequiredString(value, 'DATABASE_URL');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  return databaseUrl;
}

function parseCorsOrigins(
  value: unknown,
  nodeEnvironment: NodeEnvironment,
): string[] {
  const origins =
    typeof value === 'string'
      ? value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : [];

  if (nodeEnvironment === 'production' && origins.length === 0) {
    throw new Error('CORS_ORIGINS is required in production.');
  }

  return origins.length > 0 ? origins : DEVELOPMENT_CORS_ORIGINS;
}

function parsePositiveInteger(
  value: unknown,
  name: string,
  defaultValue: number,
): number {
  const rawValue = value ?? defaultValue;
  let parsed: number;

  if (typeof rawValue === 'number') {
    parsed = rawValue;
  } else if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    parsed = Number.parseInt(rawValue, 10);
  } else {
    throw new Error(`${name} must be a positive integer.`);
  }

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}
