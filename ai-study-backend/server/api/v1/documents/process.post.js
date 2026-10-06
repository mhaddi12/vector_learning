import { analyzeAndGenerateStudySet } from "../../../utils/ai.js";
import { prisma } from "../../../utils/prisma.js";
import { saveEmbedding } from "../../../utils/vector.js";

function fail(code, message) {
  throw createError({
    statusCode: code,
    statusMessage: message,
    data: { error: message },
  });
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const userId = String(body?.userId || "").trim();
  const title = String(body?.title || "").trim();
  const content = String(body?.content || "").trim();

  if (!userId || !title || !content) {
    fail(400, "userId, title, and content are required");
  }
  if (content.length > 100000) fail(400, "content is too long");

  try {
    const saved = await prisma.$transaction(async (db) => {
      // 1. save notes
      const doc = await db.document.create({
        data: { userId, title, content },
      });

      // 2. save vector
      await saveEmbedding(db, doc.id, `${title}\n${content}`);

      // 3. make study set (Gemini or local)
      const study = await analyzeAndGenerateStudySet(content);

      // 4. save study set
      return db.document.update({
        where: { id: doc.id },
        data: {
          summary: study.summary,
          keywords: study.keywords,
          flashcards: {
            create: study.flashcards.map((card) => ({
              userId,
              front: card.front,
              back: card.back,
              difficulty: card.difficulty,
            })),
          },
        },
        include: {
          flashcards: { orderBy: { id: "asc" } },
        },
      });
    }, { timeout: 120000 });

    setResponseStatus(event, 201);

    return {
      document: {
        id: saved.id,
        userId: saved.userId,
        title: saved.title,
        content: saved.content,
        summary: saved.summary,
        keywords: saved.keywords,
        createdAt: saved.createdAt,
      },
      flashcards: saved.flashcards.map((card) => ({
        id: card.id,
        documentId: card.documentId,
        userId: card.userId,
        front: card.front,
        back: card.back,
        difficulty: card.difficulty,
      })),
    };
  } catch (error) {
    if (error.statusCode) throw error;
    if (error.status) fail(error.status, error.message);
    console.error(error);
    fail(500, "Something went wrong");
  }
});
