const express  = require("express");
const router   = express.Router();
const Question = require("../models/Question");
const TestSuite = require("../models/TestSuite");
const authMiddleware = require("../middleware/authMiddleware");
const jwt = require("jsonwebtoken");

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
  if (suite.isPublic !== false) return true;
  return (suite.assignedUsers || []).some(id => id.toString() === user.id);
}

// ── POST /api/questions/add (legacy) ─────────────────────────
router.post("/add", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
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
      options:       filledOptions,
      correctAnswer: [correctIndex],
      category:      Array.isArray(category) ? category.filter(Boolean) : (category ? [category] : []),
    });
    await newQuestion.save();
    res.status(201).json({ message: "Question Added Successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Adding Question" });
  }
});

// ── PUT /api/questions/:id ────────────────────────────────────
router.put("/:id", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const { questionText, options, correctAnswer, explanation, marks, category, categoryCorrectAnswers } = req.body;
    const questionType = req.body.questionType === "theory" ? "theory" : "mcq";
    if (!questionText?.trim())
      return res.status(400).json({ message: "Question text is required" });
    const filledOptions = Array.isArray(options) ? options.filter(o => String(o).trim() !== "") : [];
    if (questionType === "mcq" && filledOptions.length < 2)
      return res.status(400).json({ message: "At least 2 options are required" });
    const correctArr = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
    if (questionType === "mcq" && correctArr.length === 0)
      return res.status(400).json({ message: "At least one correct answer is required" });
    const invalidIndex = correctArr.some(i => i < 0 || i >= filledOptions.length);
    if (questionType === "mcq" && invalidIndex)
      return res.status(400).json({ message: "Correct answer index out of range" });
    const categories = Array.isArray(category) ? category : (category ? [category] : []);
    const categoryAnswerMap = sanitizeCategoryCorrectAnswers(categoryCorrectAnswers, categories, filledOptions.length);

    const updated = await Question.findByIdAndUpdate(
      req.params.id,
      {
        questionText:  questionText.trim(),
        questionType,
        options:       questionType === "theory" ? [] : filledOptions,
        correctAnswer: questionType === "theory" ? [] : correctArr,
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
    res.status(500).json({ message: "Failed to update question" });
  }
});

// ── DELETE /api/questions/:id ─────────────────────────────────
router.delete("/:id", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
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
router.get("/all", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
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
      return res.status(403).json({ message: "This test is not assigned to this user" });
    }
    const questions = await Question.find({ testSuite: req.params.suiteId });

    if (!questions.length)
      return res.status(404).json({ message: "No questions found for this suite" });

    // If questionsToServe is set and less than total, shuffle and slice
    const limit = suite?.questionsToServe;
    if (limit && limit > 0 && limit < questions.length) {
      // Fisher-Yates shuffle
      const shuffled = [...questions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return res.json(shuffled.slice(0, limit));
    }

    // Otherwise return all questions
    res.json(questions);
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
