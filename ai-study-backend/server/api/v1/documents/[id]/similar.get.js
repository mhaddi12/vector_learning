import { prisma } from "../../../../utils/prisma.js";

function fail(code, message) {
  throw createError({
    statusCode: code,
    statusMessage: message,
    data: { error: message },
  });
}

export default defineEventHandler(async (event) => {
  const documentId = Number(getRouterParam(event, "id"));
  const limit = Math.min(Number(getQuery(event).limit) || 5, 10);

  if (!Number.isInteger(documentId) || documentId <= 0) {
    fail(400, "Document id must be a positive number");
  }

  const me = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true },
  });
  if (!me) fail(404, "Document not found");

  // <=> means distance. Smaller = more similar.
  // score = 1 - distance
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      other.id,
      other.title,
      other.summary,
      other.keywords,
      (1 - (other.embedding <=> me.embedding))::float8 AS score
    FROM documents AS other, documents AS me
    WHERE me.id = $1
      AND other.id <> $1
      AND me.embedding IS NOT NULL
      AND other.embedding IS NOT NULL
    ORDER BY other.embedding <=> me.embedding
    LIMIT $2
    `,
    documentId,
    limit
  );

  const similar = [];
  for (const row of rows) {
    const score = Number(Number(row.score).toFixed(3));
    if (score <= 0) continue;

    similar.push({
      id: Number(row.id),
      title: row.title,
      summary: row.summary,
      keywords: row.keywords || [],
      score,
    });
  }

  return { documentId, similar };
});
