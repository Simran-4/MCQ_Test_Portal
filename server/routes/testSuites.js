const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const TestSuite = require("../models/TestSuite");
const Question = require("../models/Question");
const authMiddleware = require("../middleware/authMiddleware");
const ExamSettings = require("../models/ExamSettings");
const jwt = require("jsonwebtoken");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

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

function normalizePassingPercentage(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
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

function requireAdmin(req, res, next) {
  if (!["admin", "superadmin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// ── GET QUESTIONS FOR A SUITE ─────────────────────────────────
router.get("/:id/questions", async (req, res) => {
  try {
    const user = readOptionalUser(req);
    const suite = await TestSuite.findById(req.params.id);
    if (!canAccessSuite(suite, user)) {
      return res.status(403).json({ message: "This test is not assigned to this user" });
    }
    const questions = await Question.find({ testSuite: req.params.id });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: "Error fetching questions" });
  }
});

// ── ADD QUESTION TO A SUITE ───────────────────────────────────
router.post("/:id/questions", authMiddleware, async (req, res) => {
  try {
    const questionType = req.body.questionType === "theory" ? "theory" : "mcq";
    const categories = Array.isArray(req.body.category)
      ? req.body.category
      : (req.body.category ? [req.body.category] : []);
    const options = Array.isArray(req.body.options)
      ? req.body.options.filter(o => String(o).trim() !== "")
      : [];
    const newQuestion = new Question({
      ...req.body,
      questionType,
      options: questionType === "theory" ? [] : options,
      correctAnswer: questionType === "theory" ? [] : req.body.correctAnswer,
      category: categories,
      categoryCorrectAnswers: questionType === "theory"
        ? {}
        : sanitizeCategoryCorrectAnswers(
          req.body.categoryCorrectAnswers,
          categories,
          options.length
        ),
      testSuite: req.params.id,
    });
    const saved = await newQuestion.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("Add Question Error:", err);
    res.status(500).json({ message: "Error adding question" });
  }
});

// ── IMPORT QUESTIONS FROM EXCEL ───────────────────────────────
router.post("/:id/import-excel", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No Excel file uploaded." });

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return res.status(400).json({ message: "Excel file is empty or has no data rows." });
    }

    const questions = [];
    const errors = [];

    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const questionText = String(row.questionText || row.Question || row.question || "").trim();
      if (!questionText) {
        errors.push(`Row ${rowNum}: missing questionText`);
        return;
      }
      const questionType = String(row.questionType || row.QuestionType || row.type || row.Type || "mcq")
        .trim()
        .toLowerCase() === "theory" ? "theory" : "mcq";

      const options = [
        String(row.option1 || row.Option1 || row.A || "").trim(),
        String(row.option2 || row.Option2 || row.B || "").trim(),
        String(row.option3 || row.Option3 || row.C || "").trim(),
        String(row.option4 || row.Option4 || row.D || "").trim(),
      ].filter(Boolean);
      if (questionType === "mcq" && options.length < 2) {
        errors.push(`Row ${rowNum}: need at least 2 options`);
        return;
      }

      const rawCorrect = String(
        row.correctAnswers || row.CorrectAnswers || row.correct || row.answer || "0"
      ).trim();
      const correctAnswer = rawCorrect
        .split(",")
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isInteger(n) && n >= 0 && n < options.length);
      if (questionType === "mcq" && correctAnswer.length === 0) {
        errors.push(`Row ${rowNum}: invalid correctAnswers`);
        return;
      }

      const rawCat = String(row.category || row.Category || "").trim();
      const category = rawCat.split(",").map(s => s.trim()).filter(Boolean);
      const categoryCorrectAnswers = sanitizeCategoryCorrectAnswers(
        row.categoryCorrectAnswers,
        category,
        options.length
      );

      questions.push({
        testSuite: req.params.id,
        questionText,
        questionType,
        options: questionType === "theory" ? [] : options,
        correctAnswer: questionType === "theory" ? [] : correctAnswer,
        categoryCorrectAnswers: questionType === "theory" ? {} : categoryCorrectAnswers,
        explanation: String(row.explanation || row.Explanation || "").trim(),
        marks: parseInt(row.marks || row.Marks || 1, 10) || 1,
        language: String(row.language || row.Language || "en").trim(),
        category,
      });
    });

    if (questions.length === 0) {
      return res.status(400).json({ message: "No valid questions found.", errors });
    }

    const inserted = await Question.insertMany(questions);
    res.status(201).json({
      message: `Successfully imported ${inserted.length} question(s).`,
      imported: inserted.length,
      skipped: errors.length,
      errors,
    });
  } catch (err) {
    console.error("Excel import error:", err);
    res.status(500).json({ message: "Failed to process Excel file.", error: err.message });
  }
});

// ── GET ALL SUITES ────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const user = readOptionalUser(req);
    const query = !user
      ? { status: "active", isPublic: { $ne: false } }
      : user.role === "candidate"
        ? {
            status: "active",
            $or: [
              { isPublic: { $ne: false } },
              { assignedUsers: user.id },
            ],
          }
        : {};
    const suites = await TestSuite.find(query).sort({ createdAt: -1 });
    const suitesWithCount = await Promise.all(
      suites.map(async (suite) => {
        const count = await Question.countDocuments({ testSuite: suite._id });
        return { ...suite.toObject(), questionCount: count };
      })
    );
    res.json(suitesWithCount);
  } catch (err) {
    res.status(500).json({ message: "Error fetching suites" });
  }
});

// ── CREATE NEW SUITE ──────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, description, status, passingPercentage } = req.body;
    const newSuite = new TestSuite({
      name,
      description,
      status: status || "draft",
      passingPercentage: normalizePassingPercentage(passingPercentage),
    });
    const savedSuite = await newSuite.save();
    res.status(201).json(savedSuite);
  } catch (err) {
    console.error("Create Suite Error:", err);
    res.status(500).json({ message: "Error creating test suite" });
  }
});

// ── UPDATE SUITE ──────────────────────────────────────────────
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.passingPercentage !== undefined) {
      payload.passingPercentage = normalizePassingPercentage(payload.passingPercentage);
    }
    const updatedSuite = await TestSuite.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true }
    );
    res.json(updatedSuite);
  } catch (err) {
    res.status(500).json({ message: "Error updating suite" });
  }
});

// ── ASSIGN SUITE TO SPECIFIC USERS ───────────────────────────
router.put("/:id/assignments", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const assignedUsers = Array.isArray(req.body.assignedUsers)
      ? req.body.assignedUsers.filter(Boolean)
      : [];
    const isPublic = req.body.isPublic !== false;
    const updatedSuite = await TestSuite.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isPublic,
          assignedUsers: isPublic ? [] : assignedUsers,
        },
      },
      { new: true }
    );
    if (!updatedSuite) return res.status(404).json({ message: "Suite not found" });
    res.json(updatedSuite);
  } catch (err) {
    res.status(500).json({ message: "Error updating suite assignments" });
  }
});

// ── DELETE SUITE ──────────────────────────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await Question.deleteMany({ testSuite: req.params.id });
    await TestSuite.findByIdAndDelete(req.params.id);
    res.json({ message: "Suite and associated questions deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting suite" });
  }
});

// ── GET SINGLE SUITE DETAILS ──────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const user = readOptionalUser(req);
    const suite = await TestSuite.findById(req.params.id);
    if (!suite) return res.status(404).json({ message: "Suite not found" });
    if (!canAccessSuite(suite, user)) {
      return res.status(403).json({ message: "This test is not assigned to this user" });
    }
    res.json(suite);
  } catch (err) {
    res.status(500).json({ message: "Error fetching suite details" });
  }
});

module.exports = router;
