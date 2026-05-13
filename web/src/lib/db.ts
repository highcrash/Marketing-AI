import { PrismaClient } from '@prisma/client';

// Singleton Prisma client. Next.js dev mode reloads modules constantly,
// so we cache the instance on globalThis to avoid the "too many open
// clients" warning during HMR. In production the module is loaded once
// and the cache is irrelevant.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
