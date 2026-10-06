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

  if (!Number.isInteger(documentId) || documentId <= 0) {
    fail(400, "Document id must be a positive number");
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      flashcards: { orderBy: { id: "asc" } },
    },
  });

  if (!doc) fail(404, "Document not found");

  return {
    documentId: doc.id,
    title: doc.title,
    summary: doc.summary,
    keywords: doc.keywords || [],
    flashcards: doc.flashcards.map((card) => ({
      id: card.id,
      documentId: card.documentId,
      userId: card.userId,
      front: card.front,
      back: card.back,
      difficulty: card.difficulty,
    })),
  };
});
