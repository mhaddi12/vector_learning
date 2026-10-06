// Make a 384-number vector from text for pgvector.

export const VECTOR_SIZE = 384;

const SKIP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "were", "will", "with", "you", "your", "this", "these",
]);

function wordCode(word) {
  let code = 0;
  for (let i = 0; i < word.length; i += 1) {
    code = (code * 31 + word.charCodeAt(i)) >>> 0;
  }
  return code;
}

function splitWords(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function textToVector(text) {
  const words = splitWords(text);
  const numbers = new Array(VECTOR_SIZE).fill(0);

  for (const word of words) {
    if (word.length < 2) continue;
    if (SKIP.has(word)) continue;

    const code = wordCode(word);
    const slot = code % VECTOR_SIZE;
    const upOrDown = code % 2 === 0 ? 1 : -1;
    numbers[slot] += upOrDown;
  }

  // Normalize so length = 1.
  let length = 0;
  for (const n of numbers) length += n * n;
  length = Math.sqrt(length);
  if (length === 0) return numbers;

  for (let i = 0; i < numbers.length; i += 1) {
    numbers[i] = Number((numbers[i] / length).toFixed(6));
  }

  return numbers;
}

export function toPgVector(numbers) {
  return `[${numbers.join(",")}]`;
}

export async function saveEmbedding(db, documentId, text) {
  const vector = toPgVector(textToVector(text));
  await db.$executeRawUnsafe(
    "UPDATE documents SET embedding = $1::vector WHERE id = $2",
    vector,
    documentId
  );
}
