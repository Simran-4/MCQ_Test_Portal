function normalizeQuestionSelectionMode(value) {
  return ["all", "random", "selected"].includes(value) ? value : "";
}

function resolveQuestionSelectionMode(suite) {
  const explicitMode = normalizeQuestionSelectionMode(suite?.questionSelectionMode);
  if (explicitMode) return explicitMode;
  if ((suite?.selectedQuestionIds || []).length > 0) return "selected";
  if (Number(suite?.questionsToServe) > 0) return "random";
  return "all";
}

function createSeededRandom(seed) {
  let state = 2166136261;
  const text = String(seed || "");
  for (let index = 0; index < text.length; index += 1) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  state >>>= 0;

  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleQuestions(questions, random = Math.random) {
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function questionCategories(question) {
  if (Array.isArray(question?.category)) {
    return question.category.map(item => String(item || "").trim()).filter(Boolean);
  }
  if (typeof question?.category === "string") {
    return question.category.split(",").map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function selectBalancedRandomQuestions(questions, limit, random = Math.random) {
  const categorizedGroups = new Map();
  const uncategorized = [];
  const shuffledQuestions = shuffleQuestions(questions, random);

  shuffledQuestions.forEach(question => {
    const categories = questionCategories(question);
    categories.forEach(category => {
      if (!categorizedGroups.has(category)) categorizedGroups.set(category, []);
    });
  });

  shuffledQuestions.forEach(question => {
    const categories = questionCategories(question);
    if (categories.length === 0) {
      uncategorized.push(question);
      return;
    }
    // A multi-category question is assigned to the currently smallest one of
    // its categories, preventing every such question from biasing category[0].
    const smallestSize = Math.min(...categories.map(category => categorizedGroups.get(category).length));
    const leastFilled = categories.filter(category => categorizedGroups.get(category).length === smallestSize);
    const assignedCategory = leastFilled[Math.floor(random() * leastFilled.length)];
    categorizedGroups.get(assignedCategory).push(question);
  });

  const groups = Array.from(categorizedGroups.entries())
    .map(([category, items]) => ({ category, items: shuffleQuestions(items, random), cursor: 0 }))
    .filter(group => group.items.length > 0);

  if (groups.length < 2) return shuffleQuestions(questions, random).slice(0, limit);

  const shuffledGroups = shuffleQuestions(groups, random);
  const selected = [];
  const selectedIds = new Set();

  // Take one question per category per pass. This guarantees that category
  // counts differ by at most one whenever every category has enough questions.
  // Categories that run out are skipped and their unused share is naturally
  // redistributed across the remaining category pools.
  while (selected.length < limit) {
    let added = false;
    for (const group of shuffledGroups) {
      const question = group.items[group.cursor++];
      if (question && !selectedIds.has(String(question._id))) {
        selected.push(question);
        selectedIds.add(String(question._id));
        added = true;
        if (selected.length >= limit) break;
      }
    }
    if (!added) break;
  }

  if (selected.length < limit) {
    [...uncategorized, ...questions].forEach(question => {
      if (selected.length >= limit) return;
      if (!selectedIds.has(String(question._id))) {
        selected.push(question);
        selectedIds.add(String(question._id));
      }
    });
  }

  return shuffleQuestions(selected, random).slice(0, limit);
}

function selectQuestionsForSuite(suite, questions, randomSeed = "") {
  const mode = resolveQuestionSelectionMode(suite);
  if (mode === "selected") {
    const selectedIds = (suite?.selectedQuestionIds || []).map(id => String(id));
    const byId = new Map(questions.map(question => [String(question._id), question]));
    return selectedIds.map(id => byId.get(id)).filter(Boolean);
  }

  if (mode === "random") {
    const limit = Number(suite?.questionsToServe);
    if (limit > 0 && limit < questions.length) {
      const random = randomSeed ? createSeededRandom(randomSeed) : Math.random;
      return selectBalancedRandomQuestions(questions, limit, random);
    }
  }

  return questions;
}

function getEffectiveQuestionCount(suite, totalQuestionCount) {
  const mode = resolveQuestionSelectionMode(suite);
  if (mode === "selected") {
    return Math.min((suite?.selectedQuestionIds || []).length, totalQuestionCount);
  }
  if (mode === "random") {
    const limit = Number(suite?.questionsToServe);
    if (limit > 0) return Math.min(limit, totalQuestionCount);
  }
  return totalQuestionCount;
}

module.exports = {
  createSeededRandom,
  getEffectiveQuestionCount,
  resolveQuestionSelectionMode,
  selectQuestionsForSuite,
};
