import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

const globalForPrisma = globalThis as unknown as { rentagentPrisma?: PrismaClient };

/** Shared Prisma client (reused across hot reloads in development). */
export function getDb(databaseUrl: string): PrismaClient {
  globalForPrisma.rentagentPrisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  return globalForPrisma.rentagentPrisma;
}
