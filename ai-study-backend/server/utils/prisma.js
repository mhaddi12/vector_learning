import { PrismaClient } from "@prisma/client";

// One Prisma client in dev (Nuxt reloads files often).
const prisma = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export { prisma };
