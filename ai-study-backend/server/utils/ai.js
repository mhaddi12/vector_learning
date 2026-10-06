import { GoogleGenAI, Type } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const SKIP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "were", "will", "with", "you", "your", "this", "these",
]);

const prompt = `Turn these notes into a study set.
Write a 2-3 sentence summary.
Pick 5 to 10 keywords.
Make one flashcard per fact.
Front = question. Back = short answer.
Difficulty = easy, medium, or hard.`;

const schema = {
  type: Type.OBJECT,
  required: ["summary", "keywords", "flashcards"],
  properties: {
    summary: { type: Type.STRING },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    flashcards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["front", "back", "difficulty"],
        properties: {
          front: { type: Type.STRING },
          back: { type: Type.STRING },
          difficulty: {
            type: Type.STRING,
            enum: ["easy", "medium", "hard"],
          },
        },
      },
    },
  },
};

function fail(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Keep only good cards.
function cleanCards(list) {
  const cards = [];
  const seen = new Set();

  for (const card of list || []) {
    const front = String(card?.front || "").trim();
    const back = String(card?.back || "").trim();
    const difficulty = String(card?.difficulty || "").trim().toLowerCase();

    if (!front || !back) continue;
    if (!["easy", "medium", "hard"].includes(difficulty)) continue;
    if (seen.has(front.toLowerCase())) continue;

    seen.add(front.toLowerCase());
    cards.push({ front, back, difficulty });
  }

  return cards.slice(0, 50);
}

// Simple study set without Gemini (for learning / when quota is finished).
function makeLocalStudySet(notes) {
  const text = String(notes || "").trim();

  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !SKIP.has(w));

  const keywords = [];
  for (const word of words) {
    if (keywords.includes(word)) continue;
    keywords.push(word);
    if (keywords.length === 8) break;
  }

  const levels = ["easy", "medium", "hard"];
  const flashcards = [];

  for (let i = 0; i < sentences.length && i < 8; i += 1) {
    flashcards.push({
      front: `What does this note say? (${i + 1})`,
      back: sentences[i] + ".",
      difficulty: levels[i % 3],
    });
  }

  if (flashcards.length === 0) {
    flashcards.push({
      front: "What is the main idea?",
      back: text.slice(0, 220),
      difficulty: "easy",
    });
  }

  return {
    summary: sentences.slice(0, 2).join(". ") + (sentences.length ? "." : " Local study set."),
    keywords: keywords.length ? keywords : ["notes", "study"],
    flashcards,
  };
}

async function makeGeminiStudySet(notes) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw fail("GEMINI_API_KEY is not set", 503);

  const ai = new GoogleGenAI({ apiKey });

  const result = await ai.models.generateContent({
    model: MODEL,
    contents: notes,
    config: {
      systemInstruction: prompt,
      temperature: 0.2,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: schema,
      abortSignal: AbortSignal.timeout(120000),
    },
  });

  if (!result.text) throw fail("Gemini returned nothing");

  let data;
  try {
    data = JSON.parse(result.text);
  } catch {
    throw fail("Gemini did not return JSON");
  }

  const summary = String(data.summary || "").trim();
  const keywords = [];
  for (const word of data.keywords || []) {
    const clean = String(word || "").trim();
    if (clean) keywords.push(clean);
  }
  const flashcards = cleanCards(data.flashcards);

  if (!summary) throw fail("No summary");
  if (!keywords.length) throw fail("No keywords");
  if (!flashcards.length) throw fail("No flashcards");

  return {
    summary,
    keywords: keywords.slice(0, 10),
    flashcards,
  };
}

export async function analyzeAndGenerateStudySet(notes) {
  // Local mode: USE_LOCAL_AI=true in .env
  if (process.env.USE_LOCAL_AI === "true") {
    return makeLocalStudySet(notes);
  }

  try {
    return await makeGeminiStudySet(notes);
  } catch (err) {
    console.error(err);

    const msg = String(err?.message || "");
    const outOfQuota =
      err?.status === 429 ||
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("RESOURCE_EXHAUSTED");

    // If Gemini is out of free requests, still let the app work.
    if (outOfQuota || !process.env.GEMINI_API_KEY) {
      console.warn("Using local study set.");
      return makeLocalStudySet(notes);
    }

    if (err.status) throw err;
    throw fail("Gemini request failed");
  }
}
