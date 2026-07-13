const { resolveQuestionSelectionMode, selectQuestionsForSuite } = require("./questionSelection");

const LANGUAGE_ALIASES = {
  english: "en",
  eng: "en",
  hindi: "hi",
  hin: "hi",
  marathi: "mr",
  mar: "mr",
};
const TRANSLATION_CACHE = new Map();
const TRANSLATABLE_LANGUAGES = new Set(["hi", "mr"]);
const DEVANAGARI_RE = /[\u0900-\u097F]/;

function normalizeLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "en";
  const base = raw.split(/[-_]/)[0];
  return LANGUAGE_ALIASES[raw] || LANGUAGE_ALIASES[base] || (["en", "hi", "mr"].includes(base) ? base : "en");
}

function questionLanguage(question) {
  return normalizeLanguage(question?.language || "en");
}

function hasDevanagariText(question) {
  return DEVANAGARI_RE.test([
    question?.questionText,
    ...(Array.isArray(question?.options) ? question.options : []),
    question?.explanation,
  ].filter(Boolean).join(" "));
}

function shouldTranslateQuestionSet(questions, requestedLanguage) {
  const language = normalizeLanguage(requestedLanguage);
  if (!TRANSLATABLE_LANGUAGES.has(language) || !questions.length) return false;
  return !questions.some(hasDevanagariText);
}

async function translateText(text, targetLanguage) {
  const source = String(text || "");
  if (!source.trim()) return source;
  const language = normalizeLanguage(targetLanguage);
  if (!TRANSLATABLE_LANGUAGES.has(language) || DEVANAGARI_RE.test(source)) return source;

  const cacheKey = `${language}:${source}`;
  if (TRANSLATION_CACHE.has(cacheKey)) return TRANSLATION_CACHE.get(cacheKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${language}&dt=t&q=${encodeURIComponent(source)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Translation failed with ${response.status}`);
    const data = await response.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map(part => Array.isArray(part) ? part[0] : "").join("")
      : "";
    const value = translated.trim() ? translated : source;
    TRANSLATION_CACHE.set(cacheKey, value);
    return value;
  } catch (err) {
    console.warn("Question translation fallback used:", err.message);
    TRANSLATION_CACHE.set(cacheKey, source);
    return source;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function translateQuestionsIfNeeded(questions, requestedLanguage) {
  const language = normalizeLanguage(requestedLanguage);
  if (!shouldTranslateQuestionSet(questions, language)) return questions;

  const textValues = [...new Set(questions.flatMap(question => [
    question.questionText,
    ...(Array.isArray(question.options) ? question.options : []),
    question.explanation,
  ].map(value => String(value || "").trim()).filter(Boolean)))];
  const translatedValues = await mapWithConcurrency(textValues, 16, async value => [
    value,
    await translateText(value, language),
  ]);
  const translations = new Map(translatedValues);

  return questions.map(question => ({
    ...(question.toJSON?.() || question),
    language,
    questionText: translations.get(String(question.questionText || "").trim()) || question.questionText,
    options: Array.isArray(question.options)
      ? question.options.map(option => translations.get(String(option || "").trim()) || option)
      : question.options,
    explanation: question.explanation
      ? translations.get(String(question.explanation || "").trim()) || question.explanation
      : question.explanation,
  }));
}

function questionsForLanguage(questions, requestedLanguage) {
  const language = normalizeLanguage(requestedLanguage);
  const exactMatches = questions.filter(question => questionLanguage(question) === language);
  if (exactMatches.length > 0) return exactMatches;

  const englishFallback = questions.filter(question => questionLanguage(question) === "en");
  return englishFallback.length > 0 ? englishFallback : questions;
}

function selectQuestionsForLanguage(suite, questions, requestedLanguage) {
  const languageQuestions = questionsForLanguage(questions, requestedLanguage);
  const mode = resolveQuestionSelectionMode(suite);

  if (mode !== "selected") {
    return selectQuestionsForSuite(suite, languageQuestions);
  }

  const selectedIds = new Set((suite?.selectedQuestionIds || []).map(id => String(id?._id || id)));
  if (selectedIds.size === 0) return [];

  const firstSelectedQuestion = questions.find(question => selectedIds.has(String(question._id)));
  const sourceQuestions = firstSelectedQuestion
    ? questions.filter(question => questionLanguage(question) === questionLanguage(firstSelectedQuestion))
    : questions;

  const selectedPositions = sourceQuestions
    .map((question, index) => selectedIds.has(String(question._id)) ? index : -1)
    .filter(index => index >= 0);

  if (selectedPositions.length === 0) {
    return selectQuestionsForSuite(suite, languageQuestions);
  }

  return selectedPositions
    .map(index => languageQuestions[index])
    .filter(Boolean);
}

module.exports = {
  normalizeLanguage,
  questionsForLanguage,
  selectQuestionsForLanguage,
  translateQuestionsIfNeeded,
};
