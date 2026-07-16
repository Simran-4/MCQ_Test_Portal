const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const {
  createQuestionSelectionToken,
  questionSelectionFingerprint,
  readQuestionSelectionSeed,
} = require("../utils/questionSelectionToken");
const { canAccessSuite } = require("../utils/suiteAccess");

function randomSuite() {
  return {
    questionSelectionMode: "random",
    questionsToServe: 25,
  };
}

test("question selection tokens stay compact and restore the deterministic seed", () => {
  const suite = randomSuite();
  const questions = Array.from({ length: 250 }, (_, index) => ({
    _id: `question-${index + 1}`,
    category: [index % 2 === 0 ? "A" : "B"],
  }));
  const fingerprint = questionSelectionFingerprint(suite, questions);
  const token = createQuestionSelectionToken({
    suiteId: "suite-1",
    userId: "candidate-1",
    seed: "seed-123",
    fingerprint,
  });

  assert(token.length < 1000);
  assert.equal(readQuestionSelectionSeed({
    token,
    suiteId: "suite-1",
    userId: "candidate-1",
    fingerprint,
  }), "seed-123");
});

test("selection tokens cannot be used as login tokens or by another user", () => {
  const fingerprint = questionSelectionFingerprint(randomSuite(), [
    { _id: "question-1", category: ["A"] },
  ]);
  const token = createQuestionSelectionToken({
    suiteId: "suite-1",
    userId: "candidate-1",
    seed: "seed-123",
    fingerprint,
  });

  assert.throws(() => jwt.verify(
    token,
    process.env.JWT_SECRET || "snehalaya2024"
  ));
  assert.throws(
    () => readQuestionSelectionSeed({
      token,
      suiteId: "suite-1",
      userId: "candidate-2",
      fingerprint,
    }),
    error => error?.statusCode === 409
  );
});

test("unknown signed payload roles do not receive privileged suite access", () => {
  const privateInactiveSuite = {
    status: "inactive",
    isPublic: false,
    deletedAt: null,
    assignedUsers: [],
  };

  assert.equal(
    canAccessSuite(privateInactiveSuite, { type: "question-selection" }),
    false
  );
  assert.equal(
    canAccessSuite(privateInactiveSuite, { id: "admin-1", role: "admin" }),
    true
  );
});
