<script setup>
useHead({ title: "Study desk" });

const userId = ref("");
const title = ref("");
const content = ref("");
const documentId = ref("");
const status = ref("");
const errorMessage = ref("");
const busy = ref(false);

const studySet = ref(null);
const similarSets = ref([]);
const filter = ref("all");
const cardIndex = ref(0);
const flipped = ref(false);

const filters = [
  { name: "all", label: "All" },
  { name: "easy", label: "Easy" },
  { name: "medium", label: "Medium" },
  { name: "hard", label: "Hard" },
];

const visibleCards = computed(() => {
  if (!studySet.value) return [];
  if (filter.value === "all") return studySet.value.flashcards;
  return studySet.value.flashcards.filter((card) => card.difficulty === filter.value);
});

const currentCard = computed(() => visibleCards.value[cardIndex.value] || null);

onMounted(() => {
  const saved = localStorage.getItem("studyUserId");
  if (saved) userId.value = saved;
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
});

function onKey(event) {
  if (event.target.matches("input, textarea")) return;
  if (!studySet.value) return;
  if (event.key === "ArrowRight") moveCard(1);
  if (event.key === "ArrowLeft") moveCard(-1);
}

function resetView(nextSet) {
  studySet.value = nextSet;
  similarSets.value = [];
  filter.value = "all";
  cardIndex.value = 0;
  flipped.value = false;
}

function moveCard(step) {
  const next = cardIndex.value + step;
  if (next < 0 || next >= visibleCards.value.length) return;
  cardIndex.value = next;
  flipped.value = false;
}

function setFilter(name) {
  filter.value = name;
  cardIndex.value = 0;
  flipped.value = false;
}

function readError(error) {
  return error?.data?.error || error?.statusMessage || "Request failed";
}

async function loadSimilar(id) {
  try {
    const data = await $fetch(`/api/v1/documents/${id}/similar`);
    similarSets.value = data.similar || [];
  } catch {
    similarSets.value = [];
  }
}

async function makeCards() {
  errorMessage.value = "";
  busy.value = true;
  status.value = "Making flashcards…";
  localStorage.setItem("studyUserId", userId.value.trim());

  try {
    const data = await $fetch("/api/v1/documents/process", {
      method: "POST",
      body: {
        userId: userId.value.trim(),
        title: title.value.trim(),
        content: content.value.trim(),
      },
    });

    resetView({
      id: data.document.id,
      title: data.document.title,
      summary: data.document.summary,
      keywords: data.document.keywords || [],
      flashcards: data.flashcards || [],
    });
    documentId.value = String(data.document.id);
    await loadSimilar(data.document.id);
  } catch (error) {
    errorMessage.value = readError(error);
  } finally {
    busy.value = false;
    status.value = "";
  }
}

async function openSet() {
  if (!documentId.value.trim()) {
    errorMessage.value = "Enter the set number first.";
    return;
  }

  errorMessage.value = "";
  busy.value = true;
  status.value = "Opening set…";

  try {
    const data = await $fetch(`/api/v1/documents/${documentId.value.trim()}/flashcards`);
    resetView({
      id: data.documentId,
      title: data.title,
      summary: data.summary,
      keywords: data.keywords || [],
      flashcards: data.flashcards || [],
    });
    await loadSimilar(data.documentId);
  } catch (error) {
    errorMessage.value = readError(error);
  } finally {
    busy.value = false;
    status.value = "";
  }
}

async function openSimilar(id) {
  documentId.value = String(id);
  await openSet();
}
</script>

<template>
  <header class="top">
    <p class="eyebrow">Study desk</p>
    <h1>Paste your notes. Leave with cards you can review.</h1>
  </header>

  <main class="layout">
    <section class="panel">
      <form @submit.prevent="makeCards">
        <label>
          Your name
          <input v-model="userId" autocomplete="name" required />
        </label>
        <label>
          Title
          <input v-model="title" required placeholder="Cell structure" />
        </label>
        <label>
          Notes
          <textarea v-model="content" rows="12" required placeholder="Paste the passage you want to learn." />
        </label>
        <button type="submit" :disabled="busy">
          {{ busy ? "Working…" : "Make flashcards" }}
        </button>
        <p v-if="status" class="status">{{ status }}</p>
        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      </form>

      <form class="open-form" @submit.prevent="openSet">
        <label>
          Open a saved set
          <input v-model="documentId" inputmode="numeric" placeholder="Set number" />
        </label>
        <button type="submit" :disabled="busy">Open</button>
      </form>
    </section>

    <section class="panel result" aria-live="polite">
      <div v-if="!studySet" class="empty">
        <p class="eyebrow">Nothing here yet</p>
        <p>Your summary and flashcards will show up on this side.</p>
      </div>

      <template v-else>
        <div class="result-head">
          <div>
            <p class="eyebrow">Study set</p>
            <h2>{{ studySet.title || "Untitled" }}</h2>
          </div>
          <p class="set-id">Set {{ studySet.id }}</p>
        </div>

        <p v-if="studySet.summary" class="summary">{{ studySet.summary }}</p>

        <ul v-if="studySet.keywords.length" class="keywords">
          <li v-for="keyword in studySet.keywords" :key="keyword">{{ keyword }}</li>
        </ul>

        <div class="filters">
          <button
            v-for="item in filters"
            :key="item.name"
            type="button"
            class="ghost"
            :aria-pressed="filter === item.name"
            @click="setFilter(item.name)"
          >
            {{ item.label }}
          </button>
        </div>

        <p v-if="!currentCard" class="summary">No cards in this group.</p>

        <template v-else>
          <div class="card-scene">
            <button
              type="button"
              class="card"
              :class="{ 'is-flipped': flipped }"
              @click="flipped = !flipped"
            >
              <span class="face">
                <span class="pill" :class="currentCard.difficulty">{{ currentCard.difficulty }}</span>
                <p>{{ currentCard.front }}</p>
                <span class="hint">Click to flip</span>
              </span>
              <span class="face back">
                <span class="pill" :class="currentCard.difficulty">{{ currentCard.difficulty }}</span>
                <p>{{ currentCard.back }}</p>
                <span class="hint">Click to flip back</span>
              </span>
            </button>
          </div>

          <div class="card-nav">
            <button type="button" class="ghost" :disabled="cardIndex === 0" @click="moveCard(-1)">
              Previous
            </button>
            <p>{{ cardIndex + 1 }} of {{ visibleCards.length }}</p>
            <button
              type="button"
              class="ghost"
              :disabled="cardIndex === visibleCards.length - 1"
              @click="moveCard(1)"
            >
              Next
            </button>
          </div>
        </template>

        <div v-if="similarSets.length" class="similar">
          <p class="eyebrow">Similar notes</p>
          <button
            v-for="item in similarSets"
            :key="item.id"
            type="button"
            class="similar-item"
            @click="openSimilar(item.id)"
          >
            <span>
              <strong>{{ item.title }}</strong>
              <small>Set {{ item.id }}</small>
            </span>
            <span class="score">{{ Math.round(item.score * 100) }}%</span>
          </button>
        </div>
      </template>
    </section>
  </main>
</template>
