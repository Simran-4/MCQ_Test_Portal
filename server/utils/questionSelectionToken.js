const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { resolveQuestionSelectionMode } = require("./questionSelection");

const TOKEN_TYPE = "question-selection";
const TOKEN_ERROR_MESSAGE =
  "The saved question set is no longer valid. Reload the test to continue safely.";

function selectionTokenSecret() {
  return process.env.QUESTION_SELECTION_SECRET ||
    `${process.env.JWT_SECRET || "snehalaya2024"}:question-selection`;
}

function normalizedCategories(question) {
  const categories = Array.isArray(question?.category)
    ? question.category
    : String(question?.category || "").split(",");
  return categories
    .map(category => String(category || "").trim())
    .filter(Boolean);
}

function questionSelectionFingerprint(suite, questions) {
  const snapshot = {
    mode: resolveQuestionSelectionMode(suite),
    questionsToServe: Number(suite?.questionsToServe) || 0,
    questions: (Array.isArray(questions) ? questions : []).map(question => ({
      id: String(question?._id || ""),
      categories: normalizedCategories(question),
    })),
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("base64url");
}

function invalidSelectionTokenError() {
  const error = new Error(TOKEN_ERROR_MESSAGE);
  error.statusCode = 409;
  return error;
}

function createQuestionSelectionToken({
  suiteId,
  userId,
  seed,
  fingerprint,
}) {
  return jwt.sign(
    {
      type: TOKEN_TYPE,
      suiteId: String(suiteId || ""),
      userId: String(userId || ""),
      seed: String(seed || ""),
      fingerprint: String(fingerprint || ""),
    },
    selectionTokenSecret(),
    { algorithm: "HS256", expiresIn: "1d" }
  );
}

function readQuestionSelectionSeed({
  token,
  suiteId,
  userId,
  fingerprint,
}) {
  if (!token) return "";

  try {
    const payload = jwt.verify(String(token), selectionTokenSecret(), {
      algorithms: ["HS256"],
    });
    if (
      payload?.type !== TOKEN_TYPE ||
      String(payload.suiteId || "") !== String(suiteId || "") ||
      String(payload.userId || "") !== String(userId || "") ||
      String(payload.fingerprint || "") !== String(fingerprint || "") ||
      !String(payload.seed || "")
    ) {
      throw invalidSelectionTokenError();
    }
    return String(payload.seed);
  } catch (error) {
    if (error?.statusCode === 409) throw error;
    throw invalidSelectionTokenError();
  }
}

module.exports = {
  createQuestionSelectionToken,
  questionSelectionFingerprint,
  readQuestionSelectionSeed,
  selectionTokenSecret,
};
