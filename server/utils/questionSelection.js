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

function shuffleQuestions(questions) {
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

function selectBalancedRandomQuestions(questions, limit) {
  const categorizedGroups = new Map();
  const uncategorized = [];

  shuffleQuestions(questions).forEach(question => {
    const categories = questionCategories(question);
    const primaryCategory = categories[0];
    if (!primaryCategory) {
      uncategorized.push(question);
      return;
    }
    if (!categorizedGroups.has(primaryCategory)) categorizedGroups.set(primaryCategory, []);
    categorizedGroups.get(primaryCategory).push(question);
  });

  const groups = Array.from(categorizedGroups.entries())
    .map(([category, items]) => ({ category, items: shuffleQuestions(items), cursor: 0 }))
    .filter(group => group.items.length > 0);

  if (groups.length < 2) return shuffleQuestions(questions).slice(0, limit);

  const selected = [];
  const selectedIds = new Set();
  const shuffledGroups = shuffleQuestions(groups);
  const base = Math.floor(limit / shuffledGroups.length);
  let remainder = limit % shuffledGroups.length;

  shuffledGroups.forEach(group => {
    const target = Math.min(group.items.length, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder -= 1;
    for (let i = 0; i < target; i += 1) {
      const question = group.items[group.cursor++];
      if (question && !selectedIds.has(String(question._id))) {
        selected.push(question);
        selectedIds.add(String(question._id));
      }
    }
  });

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

  return shuffleQuestions(selected).slice(0, limit);
}

function selectQuestionsForSuite(suite, questions) {
  const mode = resolveQuestionSelectionMode(suite);
  if (mode === "selected") {
    const selectedIds = (suite?.selectedQuestionIds || []).map(id => String(id));
    const byId = new Map(questions.map(question => [String(question._id), question]));
    return selectedIds.map(id => byId.get(id)).filter(Boolean);
  }

  if (mode === "random") {
    const limit = Number(suite?.questionsToServe);
    if (limit > 0 && limit < questions.length) return selectBalancedRandomQuestions(questions, limit);
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
  getEffectiveQuestionCount,
  resolveQuestionSelectionMode,
  selectQuestionsForSuite,
};
