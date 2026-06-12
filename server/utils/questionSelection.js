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

function selectQuestionsForSuite(suite, questions) {
  const mode = resolveQuestionSelectionMode(suite);
  if (mode === "selected") {
    const selectedIds = (suite?.selectedQuestionIds || []).map(id => String(id));
    const byId = new Map(questions.map(question => [String(question._id), question]));
    return selectedIds.map(id => byId.get(id)).filter(Boolean);
  }

  if (mode === "random") {
    const limit = Number(suite?.questionsToServe);
    if (limit > 0 && limit < questions.length) return shuffleQuestions(questions).slice(0, limit);
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
