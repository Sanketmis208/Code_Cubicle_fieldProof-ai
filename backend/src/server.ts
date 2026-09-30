import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

const server = app.listen(env.PORT, () => console.log(`FieldProof API listening on http://localhost:${env.PORT}`));

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
