const express  = require("express");
const router   = express.Router();
const Question = require("../models/Question");
const TestSuite = require("../models/TestSuite");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const jwt = require("jsonwebtoken");
const { hasAdminPermission } = require("../utils/adminPermissions");
const { selectQuestionsForSuite } = require("../utils/questionSelection");

const requireAdminOrSuperAdmin = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Super admin access required" });
  }
  next();
};

function requireAdminFeature(feature, message) {
  return async (req, res, next) => {
    try {
      if (req.user.role === "superadmin") return next();
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const user = await User.findById(req.user.id).select("role adminPermissions");
      if (!hasAdminPermission(user, feature)) {
        return res.status(403).json({ message });
      }
      next();
    } catch (err) {
      res.status(500).json({ message: "Permission check failed" });
    }
  };
}

function sanitizeCategoryCorrectAnswers(rawMap, categories, optionCount) {
  const source = rawMap && typeof rawMap === "object" ? rawMap : {};
  return (Array.isArray(categories) ? categories : [])
    .reduce((acc, cat) => {
      const answers = Array.isArray(source[cat]) ? source[cat] : [];
      acc[cat] = [...new Set(answers.map(Number))]
        .filter(i => Number.isInteger(i) && i >= 0 && i < optionCount);
      return acc;
    }, {});
}

function maxScoreIndexes(optionScores) {
  const scores = (Array.isArray(optionScores) ? optionScores : []).map(Number).filter(Number.isFinite);
  if (scores.length === 0) return [];
  const max = Math.max(...scores);
  return scores
    .map((score, index) => score === max && max > 0 ? index : null)
    .filter(Number.isInteger);
}

function readOptionalUser(req) {
  const authHeader = req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET || "snehalaya2024");
  } catch {
    return null;
  }
}

function canAccessSuite(suite, user) {
  if (!suite) return false;
  if (!user) return suite.status === "active" && suite.isPublic !== false;
  if (user.role !== "candidate") return true;
  if (suite.status !== "active") return false;
  return true;
}

function sanitizeImageUrl(value) {
  const imageUrl = String(value || "").trim();
  if (!imageUrl) return "";
  if (imageUrl.length > 2_500_000) {
    const err = new Error("Question picture is too large. Use an image under 1.5 MB.");
    err.statusCode = 400;
    throw err;
  }
  return imageUrl;
}

// ── POST /api/questions/add (legacy) ─────────────────────────
router.post("/add", authMiddleware, requireAdminFeature("canManageQuestions", "Question management access denied"), async (req, res) => {
  try {
    const { question, options, correctAnswer, category, testSuiteId } = req.body;
    const filledOptions = Array.isArray(options) ? options.filter(o => String(o).trim() !== "") : [];
    const correctIndex  = filledOptions.indexOf(correctAnswer);
    if (correctIndex === -1)
      return res.status(400).json({ message: "Correct answer must match one of the options" });
    if (!testSuiteId)
      return res.status(400).json({ message: "Test suite is required" });
    const newQuestion = new Question({
      testSuite:     testSuiteId,
      questionText:  question.trim(),
      imageUrl:      sanitizeImageUrl(req.body.imageUrl),
      options:       filledOptions,
      correctAnswer: [correctIndex],
      category:      Array.isArray(category) ? category.filter(Boolean) : (category ? [category] : []),
    });
    await newQuestion.save();
    res.status(201).json({ message: "Question Added Successfully" });
  } catch (err) {
    console.log(err);
    res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : "Error Adding Question" });
  }
});

// ── PUT /api/questions/:id ────────────────────────────────────
router.put("/:id", authMiddleware, requireAdminFeature("canManageQuestions", "Question management access denied"), async (req, res) => {
  try {
    const { questionText, options, correctAnswer, optionScores, explanation, marks, category, categoryCorrectAnswers } = req.body;
    const questionType = req.body.questionType === "theory" ? "theory" : "mcq";
    if (!questionText?.trim())
      return res.status(400).json({ message: "Question text is required" });
    const filledOptions = Array.isArray(options) ? options.filter(o => String(o).trim() !== "") : [];
    if (questionType === "mcq" && filledOptions.length < 2)
      return res.status(400).json({ message: "At least 2 options are required" });
    const categories = Array.isArray(category) ? category : (category ? [category] : []);
    const categoryAnswerMap = sanitizeCategoryCorrectAnswers(categoryCorrectAnswers, categories, filledOptions.length);
    const normalizedOptionScores = Array.isArray(optionScores)
      ? optionScores
        .slice(0, filledOptions.length)
        .map(Number)
        .map(score => Number.isFinite(score) ? score : 0)
      : [];
    const rawCorrectArr = Array.isArray(correctAnswer)
      ? correctAnswer
      : correctAnswer !== undefined && correctAnswer !== null ? [correctAnswer] : [];
    const correctArr = rawCorrectArr.length > 0 ? rawCorrectArr : maxScoreIndexes(normalizedOptionScores);
    if (questionType === "mcq" && correctArr.length === 0)
      return res.status(400).json({ message: "At least one correct answer or option score is required" });
    const invalidIndex = correctArr.some(i => i < 0 || i >= filledOptions.length);
    if (questionType === "mcq" && invalidIndex)
      return res.status(400).json({ message: "Correct answer index out of range" });

    const updated = await Question.findByIdAndUpdate(
      req.params.id,
      {
        questionText:  questionText.trim(),
        imageUrl:      sanitizeImageUrl(req.body.imageUrl),
        questionType,
        options:       questionType === "theory" ? [] : filledOptions,
        correctAnswer: questionType === "theory" ? [] : correctArr,
        optionScores:  questionType === "theory" ? [] : normalizedOptionScores,
        explanation:   explanation || "",
        marks:         marks || 1,
        category:      categories,
        categoryCorrectAnswers: questionType === "theory" ? {} : categoryAnswerMap,
      },
      { new: true, runValidators: true }
    );
    if (!updated)
      return res.status(404).json({ message: "Question not found" });
    res.json(updated);
  } catch (err) {
    console.error("PUT /api/questions/:id error:", err);
    res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : "Failed to update question" });
  }
});

// ── DELETE /api/questions/:id ─────────────────────────────────
router.delete("/:id", authMiddleware, requireAdminFeature("canManageQuestions", "Question management access denied"), async (req, res) => {
  try {
    const deleted = await Question.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ message: "Question not found" });
    res.json({ message: "Question deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/questions/:id error:", err);
    res.status(500).json({ message: "Failed to delete question" });
  }
});

// ── GET /api/questions/all ────────────────────────────────────
router.get("/all", authMiddleware, requireAdminFeature("canViewQuestions", "Question bank access denied"), async (req, res) => {
  try {
    const questions = await Question.find();
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: "Error Fetching Questions" });
  }
});

// ── GET /api/questions/:suiteId/random ───────────────────────
// Feature 5 & 15: Serve N random questions from the pool
router.get("/:suiteId/random", async (req, res) => {
  try {
    const suite     = await TestSuite.findById(req.params.suiteId);
    const user      = readOptionalUser(req);
    if (!canAccessSuite(suite, user)) {
      return res.status(403).json({ message: "This test is not available" });
    }
    const questions = await Question.find({ testSuite: req.params.suiteId }).sort({ createdAt: 1, _id: 1 });

    if (!questions.length)
      return res.status(404).json({ message: "No questions found for this suite" });

    res.json(selectQuestionsForSuite(suite, questions));
  } catch (err) {
    console.error("Random questions error:", err);
    res.status(500).json({ message: "Error fetching questions" });
  }
});

// ── GET /api/questions/delete-all (utility) ───────────────────
router.get("/delete-all", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    await Question.deleteMany({});
    res.json({ message: "All Questions Deleted Successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error Deleting Questions" });
  }
});

module.exports = router;
