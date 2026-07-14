#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const args = process.argv
  .slice(2)
  .flatMap((arg) =>
    arg.startsWith('-') ? [arg] : [`--testPathPatterns=${arg}`],
  );

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'jest',
    '--runInBand',
    '--setupFiles=./test/e2e-env.setup.ts',
    '--testRegex=test/.*\\.e2e-spec\\.ts$',
    ...args,
  ],
  {
    env: process.env,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
