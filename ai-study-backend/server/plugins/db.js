import { prisma } from "../utils/prisma.js";

export default defineNitroPlugin(async () => {
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector");
  await prisma.$connect();
  console.log("Connected to PostgreSQL with pgvector");
});
