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
  const shuffledQuestions = shuffleQuestions(questions);

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
    const assignedCategory = leastFilled[Math.floor(Math.random() * leastFilled.length)];
    categorizedGroups.get(assignedCategory).push(question);
  });

  const groups = Array.from(categorizedGroups.entries())
    .map(([category, items]) => ({ category, items: shuffleQuestions(items), cursor: 0 }))
    .filter(group => group.items.length > 0);

  if (groups.length < 2) return shuffleQuestions(questions).slice(0, limit);

  const shuffledGroups = shuffleQuestions(groups);
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
