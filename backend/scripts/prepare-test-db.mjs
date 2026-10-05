import { execFileSync } from 'node:child_process';
import { testDatabaseUrl } from '../test/support/db-url.mjs';

const url = testDatabaseUrl();
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
});
console.log(`Test database ready: ${new URL(url).pathname.slice(1)}`);
