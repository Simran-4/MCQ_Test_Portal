const { resolveQuestionSelectionMode, selectQuestionsForSuite } = require("./questionSelection");

const LANGUAGE_ALIASES = {
  english: "en",
  eng: "en",
  hindi: "hi",
  hin: "hi",
  marathi: "mr",
  mar: "mr",
};
const SUPPORTED_LANGUAGES = new Set(["en", "hi", "mr"]);
const DEVANAGARI_RE = /[\u0900-\u097F]/;
const TRANSLATION_CACHE = new Map();
const TRANSLATION_IN_FLIGHT = new Map();
const TRANSLATION_TIMEOUT_MS = 4000;
const TRANSLATION_ATTEMPTS = 2;
const TRANSLATION_CONCURRENCY = 4;
const MAX_CACHE_ENTRIES = 5000;

function normalizeLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "en";
  const base = raw.split(/[-_]/)[0];
  return LANGUAGE_ALIASES[raw] ||
    LANGUAGE_ALIASES[base] ||
    (SUPPORTED_LANGUAGES.has(base) ? base : "en");
}

function questionLanguage(question) {
  return normalizeLanguage(question?.language || "en");
}

function sourceLanguageForText(text, declaredLanguage) {
  const language = normalizeLanguage(declaredLanguage);
  const hasDevanagari = DEVANAGARI_RE.test(String(text || ""));
  if (language === "en" && hasDevanagari) return "auto";
  if (language !== "en" && !hasDevanagari) return "auto";
  return language;
}

function textNeedsTranslation(text, targetLanguage, declaredLanguage) {
  const source = String(text || "").trim();
  if (!source) return false;

  const target = normalizeLanguage(targetLanguage);
  const declared = normalizeLanguage(declaredLanguage);
  if (declared !== target) return true;

  // Imported rows can have an incorrect language label. Translate obvious
  // script mismatches while trusting Hindi/Marathi text already in Devanagari.
  if (target === "en") return DEVANAGARI_RE.test(source);
  return !DEVANAGARI_RE.test(source);
}

function translationKey(text, targetLanguage, sourceLanguage) {
  return `${sourceLanguage}:${normalizeLanguage(targetLanguage)}:${String(text || "")}`;
}

function cacheTranslation(key, value) {
  if (TRANSLATION_CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = TRANSLATION_CACHE.keys().next().value;
    if (oldestKey !== undefined) TRANSLATION_CACHE.delete(oldestKey);
  }
  TRANSLATION_CACHE.set(key, value);
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function requestTranslation(text, targetLanguage, sourceLanguage) {
  let lastError;
  const target = normalizeLanguage(targetLanguage);

  for (let attempt = 0; attempt < TRANSLATION_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
    try {
      const params = new URLSearchParams({
        client: "gtx",
        sl: sourceLanguage,
        tl: target,
        dt: "t",
        q: String(text || ""),
      });
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        }
      );
      if (!response.ok) {
        const error = new Error(`Translation failed with ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }

      const data = await response.json();
      const translated = Array.isArray(data?.[0])
        ? data[0].map(part => Array.isArray(part) ? part[0] : "").join("")
        : "";
      if (!translated.trim()) throw new Error("Translation provider returned an empty response");
      return translated;
    } catch (err) {
      lastError = err;
      const retryable = err.retryable !== false;
      if (retryable && attempt + 1 < TRANSLATION_ATTEMPTS) {
        await wait(200 * (attempt + 1));
      } else {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Translation failed");
}

async function translateText(text, targetLanguage, declaredLanguage) {
  const source = String(text || "");
  if (!textNeedsTranslation(source, targetLanguage, declaredLanguage)) {
    return { value: source, attempted: false, success: true };
  }

  const sourceLanguage = sourceLanguageForText(source, declaredLanguage);
  const key = translationKey(source, targetLanguage, sourceLanguage);
  if (TRANSLATION_CACHE.has(key)) {
    return { value: TRANSLATION_CACHE.get(key), attempted: true, success: true };
  }

  if (!TRANSLATION_IN_FLIGHT.has(key)) {
    const pending = requestTranslation(source, targetLanguage, sourceLanguage)
      .then(value => {
        cacheTranslation(key, value);
        return value;
      })
      .finally(() => TRANSLATION_IN_FLIGHT.delete(key));
    TRANSLATION_IN_FLIGHT.set(key, pending);
  }

  try {
    return {
      value: await TRANSLATION_IN_FLIGHT.get(key),
      attempted: true,
      success: true,
    };
  } catch (err) {
    console.warn("Question translation fallback used:", err.message);
    // A failed fallback must not enter the success cache. The next request can
    // retry after a temporary timeout, rate limit, or hosting-network failure.
    return {
      value: source,
      attempted: true,
      success: false,
      providerUnavailable: err.retryable !== false,
    };
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

function questionTextValues(question) {
  return [
    question?.questionText,
    ...(Array.isArray(question?.options) ? question.options : []),
    question?.explanation,
  ].map(value => String(value || "").trim()).filter(Boolean);
}

function translationTaskFor(question, value, targetLanguage) {
  const declaredLanguage = questionLanguage(question);
  if (!textNeedsTranslation(value, targetLanguage, declaredLanguage)) return null;
  const sourceLanguage = sourceLanguageForText(value, declaredLanguage);
  return {
    key: translationKey(value, targetLanguage, sourceLanguage),
    value,
    declaredLanguage,
  };
}

function questionToObject(question) {
  return question?.toJSON?.() || question;
}

function annotateQuestions(questions, status, requestedLanguage, failedCount = 0) {
  return questions.map(question => ({
    ...questionToObject(question),
    _translationStatus: status,
    _translationRequestedLanguage: normalizeLanguage(requestedLanguage),
    _translationFailedCount: failedCount,
  }));
}

async function translateQuestionsWithStatus(questions, requestedLanguage) {
  const language = normalizeLanguage(requestedLanguage);
  if (!Array.isArray(questions) || questions.length === 0) {
    return { questions: [], status: "ready", failedCount: 0 };
  }

  const taskMap = new Map();
  questions.forEach(question => {
    questionTextValues(question).forEach(value => {
      const task = translationTaskFor(question, value, language);
      if (task && !taskMap.has(task.key)) taskMap.set(task.key, task);
    });
  });
  const tasks = [...taskMap.values()].sort((left, right) =>
    left.value.length - right.value.length
  );

  if (tasks.length === 0) {
    return {
      questions: annotateQuestions(questions, "ready", language),
      status: "ready",
      failedCount: 0,
    };
  }

  const translations = new Map();
  let providerUnavailable = false;
  const translationResults = await mapWithConcurrency(
    tasks,
    TRANSLATION_CONCURRENCY,
    async task => {
      if (providerUnavailable) {
        if (TRANSLATION_CACHE.has(task.key)) {
          return {
            task,
            result: {
              value: TRANSLATION_CACHE.get(task.key),
              attempted: true,
              success: true,
            },
          };
        }
        return {
          task,
          result: {
            value: task.value,
            attempted: false,
            success: false,
            providerUnavailable: true,
          },
        };
      }
      const result = await translateText(task.value, language, task.declaredLanguage);
      if (!result.success && result.providerUnavailable) providerUnavailable = true;
      return { task, result };
    }
  );

  let failedCount = 0;
  translationResults.forEach(({ task, result }) => {
    translations.set(task.key, result.value);
    if (!result.success) failedCount += 1;
  });
  const status = failedCount === tasks.length
    ? "failed"
    : failedCount > 0
      ? "partial"
      : "translated";

  const translatedQuestions = questions.map(question => {
    const declaredLanguage = questionLanguage(question);
    const translatedValue = value => {
      const source = String(value || "");
      const task = translationTaskFor(question, source.trim(), language);
      return task ? translations.get(task.key) || source : source;
    };

    return {
      ...questionToObject(question),
      language,
      questionText: translatedValue(question.questionText),
      options: Array.isArray(question.options)
        ? question.options.map(option => translatedValue(option))
        : question.options,
      explanation: question.explanation
        ? translatedValue(question.explanation)
        : question.explanation,
      _translationStatus: status,
      _translationRequestedLanguage: language,
      _translationSourceLanguage: declaredLanguage,
      _translationFailedCount: failedCount,
    };
  });

  return { questions: translatedQuestions, status, failedCount };
}

async function translateTextWithStatus(text, requestedLanguage, declaredLanguage = "en") {
  const source = String(text || "");
  const language = normalizeLanguage(requestedLanguage);
  if (!source.trim()) {
    return { text: source, status: "ready", failedCount: 0, language };
  }

  const result = await translateText(source, language, declaredLanguage);
  return {
    text: result.value,
    status: result.success
      ? result.attempted ? "translated" : "ready"
      : "failed",
    failedCount: result.success ? 0 : 1,
    language,
  };
}

async function translateQuestionsIfNeeded(questions, requestedLanguage) {
  return (await translateQuestionsWithStatus(questions, requestedLanguage)).questions;
}

function questionsForLanguage(questions, requestedLanguage) {
  const language = normalizeLanguage(requestedLanguage);
  const exactMatches = questions.filter(question => questionLanguage(question) === language);
  if (exactMatches.length > 0) return exactMatches;

  const englishFallback = questions.filter(question => questionLanguage(question) === "en");
  return englishFallback.length > 0 ? englishFallback : questions;
}

function candidateSourceQuestions(questions) {
  const englishQuestions = questions.filter(question => questionLanguage(question) === "en");
  if (englishQuestions.length > 0) return englishQuestions;

  const groups = new Map();
  questions.forEach(question => {
    const language = questionLanguage(question);
    if (!groups.has(language)) groups.set(language, []);
    groups.get(language).push(question);
  });
  return [...groups.values()].sort((left, right) => right.length - left.length)[0] || [];
}

function selectQuestionsForLanguage(suite, questions, _requestedLanguage, randomSeed = "") {
  const mode = resolveQuestionSelectionMode(suite);

  if (mode === "selected") {
    return selectQuestionsForSuite(suite, questions, randomSeed);
  }

  return selectQuestionsForSuite(
    suite,
    candidateSourceQuestions(questions),
    randomSeed
  );
}

function resetTranslationStateForTests() {
  TRANSLATION_CACHE.clear();
  TRANSLATION_IN_FLIGHT.clear();
}

module.exports = {
  normalizeLanguage,
  candidateSourceQuestions,
  questionsForLanguage,
  selectQuestionsForLanguage,
  translateQuestionsIfNeeded,
  translateQuestionsWithStatus,
  translateTextWithStatus,
  resetTranslationStateForTests,
};
