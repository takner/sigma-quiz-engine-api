#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const databaseUrl = process.env.DATABASE_URL;
const nodeEnv = process.env.NODE_ENV;

if (nodeEnv !== 'development') {
  console.error('Refusing reset: NODE_ENV must be development.');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('Refusing reset: DATABASE_URL is required.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  console.error('Refusing reset: DATABASE_URL must be a valid URL.');
  process.exit(1);
}

const allowedHosts = new Set(['localhost', '127.0.0.1', 'postgres']);
const databaseName = parsed.pathname.replace(/^\//, '');

if (!allowedHosts.has(parsed.hostname)) {
  console.error(
    'Refusing reset: database host is not approved for local development.',
  );
  process.exit(1);
}

if (!/(^|[_-])(dev|development|local|test)([_-]|$)/i.test(databaseName)) {
  console.error(
    'Refusing reset: database name must be clearly development-specific.',
  );
  process.exit(1);
}

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'migrate', 'reset', '--force'],
  {
    env: process.env,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
