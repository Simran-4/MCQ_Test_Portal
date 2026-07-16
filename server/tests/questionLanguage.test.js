const test = require("node:test");
const assert = require("node:assert/strict");

const {
  questionsForLanguage,
  selectQuestionsForLanguage,
  translateTextWithStatus,
  translateQuestionsWithStatus,
  resetTranslationStateForTests,
} = require("../utils/questionLanguage");

const originalFetch = global.fetch;

function translatedResponse(value) {
  return {
    ok: true,
    status: 200,
    async json() {
      return [[[value]]];
    },
  };
}

function question(id, language, questionText, options = [], explanation = "") {
  return {
    _id: id,
    language,
    questionText,
    options,
    explanation,
    correctAnswer: [0],
    marks: 2,
    category: ["General"],
  };
}

test.beforeEach(() => {
  resetTranslationStateForTests();
  global.fetch = originalFetch;
});

test.after(() => {
  global.fetch = originalFetch;
});

test("translates English question text, options, and explanation to Marathi", async () => {
  const calls = [];
  global.fetch = async url => {
    const params = new URL(url).searchParams;
    calls.push({
      source: params.get("sl"),
      target: params.get("tl"),
      text: params.get("q"),
    });
    return translatedResponse(`mr:${params.get("q")}`);
  };

  const source = question(
    "q1",
    "en",
    "What is your name?",
    ["My name is Asha", "I am twenty"],
    "Choose the matching answer"
  );
  const result = await translateQuestionsWithStatus([source], "mr");

  assert.equal(result.status, "translated");
  assert.equal(result.questions[0].questionText, "mr:What is your name?");
  assert.deepEqual(result.questions[0].options, [
    "mr:My name is Asha",
    "mr:I am twenty",
  ]);
  assert.equal(result.questions[0].explanation, "mr:Choose the matching answer");
  assert.deepEqual(result.questions[0].correctAnswer, source.correctAnswer);
  assert.equal(result.questions[0]._id, source._id);
  assert(calls.every(call => call.source === "en" && call.target === "mr"));
});

test("translates plain instruction text with status metadata", async () => {
  global.fetch = async url => {
    const params = new URL(url).searchParams;
    return translatedResponse(`mr:${params.get("q")}`);
  };

  const result = await translateTextWithStatus("Read carefully before starting.", "mr");

  assert.equal(result.status, "translated");
  assert.equal(result.language, "mr");
  assert.equal(result.failedCount, 0);
  assert.equal(result.text, "mr:Read carefully before starting.");
});

test("plain instruction text falls back when translation fails", async () => {
  global.fetch = async () => {
    throw new Error("temporary outage");
  };

  const result = await translateTextWithStatus("Read carefully before starting.", "hi");

  assert.equal(result.status, "failed");
  assert.equal(result.language, "hi");
  assert.equal(result.failedCount, 1);
  assert.equal(result.text, "Read carefully before starting.");
});

test("mixed target-language rows do not block translation of English rows", async () => {
  let calls = 0;
  global.fetch = async url => {
    calls += 1;
    const params = new URL(url).searchParams;
    return translatedResponse(`mr:${params.get("q")}`);
  };

  const english = question("en1", "en", "English question", ["English option"]);
  const marathi = question("mr1", "mr", "मराठी प्रश्न", ["मराठी पर्याय"]);
  const result = await translateQuestionsWithStatus([english, marathi], "mr");

  assert.equal(result.status, "translated");
  assert.equal(result.questions[0].questionText, "mr:English question");
  assert.equal(result.questions[1].questionText, "मराठी प्रश्न");
  assert.equal(result.questions[1].options[0], "मराठी पर्याय");
  assert.equal(calls, 2);
});

test("failed translations are not cached and recover on a later request", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new Error("temporary outage");
  };

  const source = question("q1", "en", "Retry this question");
  const failed = await translateQuestionsWithStatus([source], "hi");
  assert.equal(failed.status, "failed");
  assert.equal(failed.questions[0].questionText, "Retry this question");
  assert.equal(calls, 2);

  global.fetch = async url => {
    calls += 1;
    const params = new URL(url).searchParams;
    return translatedResponse(`hi:${params.get("q")}`);
  };
  const recovered = await translateQuestionsWithStatus([source], "hi");

  assert.equal(recovered.status, "translated");
  assert.equal(recovered.questions[0].questionText, "hi:Retry this question");
  assert.equal(calls, 3);
});

test("supports Hindi to Marathi translation instead of skipping Devanagari", async () => {
  let sourceLanguage = "";
  global.fetch = async url => {
    const params = new URL(url).searchParams;
    sourceLanguage = params.get("sl");
    return translatedResponse("मराठी भाषांतर");
  };

  const source = question("hi1", "hi", "हिंदी प्रश्न");
  const result = await translateQuestionsWithStatus([source], "mr");

  assert.equal(result.questions[0].questionText, "मराठी भाषांतर");
  assert.equal(sourceLanguage, "hi");
});

test("partial localized banks retain English fallback rows", () => {
  const questions = [
    question("en1", "en", "English one"),
    question("en2", "en", "English two"),
    question("mr1", "mr", "मराठी एक"),
  ];

  const marathiRows = questionsForLanguage(questions, "mr");
  assert.deepEqual(marathiRows.map(item => item._id), ["mr1"]);

  const candidateRows = selectQuestionsForLanguage(
    { questionSelectionMode: "all" },
    questions,
    "mr"
  );
  assert.deepEqual(candidateRows.map(item => item._id), ["en1", "en2"]);
});

test("selected suites preserve the configured question IDs in every language", () => {
  const questions = [
    question("en1", "en", "English one"),
    question("en2", "en", "English two"),
    question("mr1", "mr", "मराठी एक"),
  ];
  const suite = {
    questionSelectionMode: "selected",
    selectedQuestionIds: ["en1", "en2"],
  };

  const selected = selectQuestionsForLanguage(suite, questions, "mr");
  assert.deepEqual(selected.map(item => item._id), ["en1", "en2"]);
});

test("random suites keep the same question IDs and order across languages", () => {
  const questions = Array.from({ length: 12 }, (_, index) => ({
    ...question(
      `q${index + 1}`,
      "en",
      `Question ${index + 1}`,
      [`Option ${index + 1}`]
    ),
    category: [index % 2 === 0 ? "A" : "B"],
  }));
  const suite = {
    questionSelectionMode: "random",
    questionsToServe: 5,
  };

  const english = selectQuestionsForLanguage(suite, questions, "en", "stable-seed");
  const hindi = selectQuestionsForLanguage(suite, questions, "hi", "stable-seed");
  const marathi = selectQuestionsForLanguage(suite, questions, "mr", "stable-seed");
  const different = selectQuestionsForLanguage(suite, questions, "mr", "other-seed");

  const ids = rows => rows.map(item => item._id);
  assert.deepEqual(ids(hindi), ids(english));
  assert.deepEqual(ids(marathi), ids(english));
  assert.notDeepEqual(ids(different), ids(english));
});

test("supports translating Hindi questions back to English", async () => {
  let targetLanguage = "";
  global.fetch = async url => {
    const params = new URL(url).searchParams;
    targetLanguage = params.get("tl");
    return translatedResponse("English translation");
  };

  const source = question("hi1", "hi", "हिंदी प्रश्न");
  const result = await translateQuestionsWithStatus([source], "en");

  assert.equal(result.status, "translated");
  assert.equal(result.questions[0].questionText, "English translation");
  assert.equal(targetLanguage, "en");
});

test("a non-retryable field failure does not discard successful translations", async () => {
  global.fetch = async url => {
    const text = new URL(url).searchParams.get("q");
    if (text === "bad") return { ok: false, status: 400 };
    return translatedResponse(`mr:${text}`);
  };

  const source = question("q1", "en", "bad", ["translate me"]);
  const result = await translateQuestionsWithStatus([source], "mr");

  assert.equal(result.status, "partial");
  assert.equal(result.questions[0].questionText, "bad");
  assert.equal(result.questions[0].options[0], "mr:translate me");
  assert.equal(result.failedCount, 1);
});
