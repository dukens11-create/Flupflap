import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('[db] DATABASE_URL is not set. Configure it before making database calls.');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Lazily-initialized singleton — does NOT connect until the first property access.
// This prevents module-level initialization from failing at build time when
// DATABASE_URL is only available at runtime.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    const db = getDb();
    const value = (db as any)[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
  has(_target, prop: string | symbol) {
    return prop in getDb();
  },
  ownKeys(_target) {
    return Reflect.ownKeys(getDb());
  },
  getOwnPropertyDescriptor(_target, prop: string | symbol) {
    return Reflect.getOwnPropertyDescriptor(getDb(), prop);
  },
});

