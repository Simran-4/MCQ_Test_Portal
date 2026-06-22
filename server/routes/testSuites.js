const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const TestSuite = require("../models/TestSuite");
const Question = require("../models/Question");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const ExamSettings = require("../models/ExamSettings");
const jwt = require("jsonwebtoken");
const { hasAdminPermission } = require("../utils/adminPermissions");
const {
  getEffectiveQuestionCount,
  resolveQuestionSelectionMode,
  selectQuestionsForSuite,
} = require("../utils/questionSelection");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function sanitizeCategoryCorrectAnswers(rawMap, categories, optionCount, options = []) {
  const source = parseCategoryCorrectAnswers(rawMap);
  return (Array.isArray(categories) ? categories : [])
    .reduce((acc, cat) => {
      const answers = Array.isArray(source[cat]) ? source[cat] : [];
      acc[cat] = parseCorrectAnswerIndexes(answers.join(","), options)
        .filter(i => i >= 0 && i < optionCount);
      if (acc[cat].length === 0) {
        acc[cat] = [...new Set(answers.map(Number))]
          .filter(i => Number.isInteger(i) && i >= 0 && i < optionCount);
      }
      return acc;
    }, {});
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function parseCorrectAnswerIndexes(value, options) {
  const optionLetters = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };
  return [...new Set(splitList(value).map(item => {
    const token = item.toLowerCase();
    if (/^\d+$/.test(token)) return Number(token);
    if (optionLetters[token] !== undefined) return optionLetters[token];
    return options.findIndex(option => option.toLowerCase() === token);
  }))]
    .filter(index => Number.isInteger(index) && index >= 0 && index < options.length);
}

function parseOptionScores(value, optionCount) {
  const scores = splitList(value).map(item => Number(item));
  if (scores.length === 0 || scores.some(score => !Number.isFinite(score))) return [];
  return scores.slice(0, optionCount);
}

function rowScoreValue(row, index) {
  const letters = ["A", "B", "C", "D", "E", "F"];
  const number = index + 1;
  const keys = [
    `option${number}Score`,
    `Option${number}Score`,
    `score${number}`,
    `Score${number}`,
    `${letters[index]}Score`,
    `${letters[index].toLowerCase()}Score`,
    `score${letters[index]}`,
    `Score${letters[index]}`,
  ];
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      const value = Number(row[key]);
      return Number.isFinite(value) ? value : null;
    }
  }
  return null;
}

function parseOptionScoresFromRow(row, options) {
  const direct = parseOptionScores(
    row.optionScores || row.OptionScores || row.scores || row.Scores,
    options.length
  );
  if (direct.length > 0) return direct;
  const perOption = options.map((_, index) => rowScoreValue(row, index));
  return perOption.some(value => value !== null)
    ? perOption.map(value => Number.isFinite(value) ? value : 0)
    : [];
}

function maxScoreIndexes(optionScores) {
  const scores = (Array.isArray(optionScores) ? optionScores : []).map(Number).filter(Number.isFinite);
  if (scores.length === 0) return [];
  const max = Math.max(...scores);
  return scores
    .map((score, index) => score === max && max > 0 ? index : null)
    .filter(Number.isInteger);
}

function parseCategoryCorrectAnswers(rawMap) {
  if (!rawMap) return {};
  if (typeof rawMap === "object" && !Array.isArray(rawMap)) return rawMap;

  const text = String(rawMap || "").trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Keep parsing the simple "Category: 0,1; Other: A" format below.
  }

  return text.split(";").reduce((acc, part) => {
    const separator = part.includes(":") ? ":" : part.includes("=") ? "=" : "";
    if (!separator) return acc;
    const [category, answers] = part.split(separator);
    const name = String(category || "").trim();
    if (name) acc[name] = splitList(answers);
    return acc;
  }, {});
}

function normalizePassingPercentage(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
}

function sanitizeSuiteUpdatePayload(body) {
  const payload = { ...body };
  if (payload.passingPercentage !== undefined) {
    payload.passingPercentage = normalizePassingPercentage(payload.passingPercentage);
  }
  if (payload.questionSelectionMode !== undefined) {
    payload.questionSelectionMode = ["all", "random", "selected"].includes(payload.questionSelectionMode)
      ? payload.questionSelectionMode
      : "all";
  }
  if (payload.scoringMode !== undefined) {
    payload.scoringMode = payload.scoringMode === "sixteen_pf" ? "sixteen_pf" : "standard";
  }
  if (payload.questionsToServe !== undefined) {
    const numeric = Number(payload.questionsToServe);
    payload.questionsToServe = Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
  }
  if (payload.selectedQuestionIds !== undefined) {
    payload.selectedQuestionIds = [...new Set(
      (Array.isArray(payload.selectedQuestionIds) ? payload.selectedQuestionIds : [])
        .map(id => String(id))
        .filter(Boolean)
    )];
  }
  if (payload.questionSelectionMode === "all") {
    payload.questionsToServe = null;
    payload.selectedQuestionIds = [];
  }
  if (payload.questionSelectionMode === "random") {
    payload.selectedQuestionIds = [];
  }
  if (payload.questionSelectionMode === "selected") {
    payload.questionsToServe = null;
  }
  return payload;
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
  if (suite.deletedAt) return false;
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

function sanitizeVideoUrl(value) {
  const videoUrl = String(value || "").trim();
  if (!videoUrl) return "";
  if (videoUrl.length > 12_000_000) {
    const err = new Error("Question video is too large. Use a video under 8 MB or paste a direct video URL.");
    err.statusCode = 400;
    throw err;
  }
  return videoUrl;
}

function metaUserId(entry) {
  return String(entry?.user?._id || entry?.user || "");
}

function assignedMetaById(suite) {
  return new Map((suite.assignedUsersMeta || [])
    .filter(entry => metaUserId(entry))
    .map(entry => [metaUserId(entry), entry.assignedAt || new Date()]));
}

function requireAdmin(req, res, next) {
  if (!["admin", "superadmin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

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

async function optionalAdminHasFeature(user, feature) {
  if (!user || user.role === "candidate") return true;
  if (user.role === "superadmin") return true;
  if (user.role !== "admin") return false;
  const fullUser = await User.findById(user.id).select("role adminPermissions");
  return hasAdminPermission(fullUser, feature);
}

async function requireCurrentPassword(req, res) {
  const password = String(req.body?.password || "");
  if (!password) {
    res.status(400).json({ message: "Enter your password to confirm this deletion" });
    return false;
  }

  const user = await User.findById(req.user.id).select("password");
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(403).json({ message: "Password confirmation failed" });
    return false;
  }

  return true;
}

// ── GET QUESTIONS FOR A SUITE ─────────────────────────────────
router.get("/:id/questions", async (req, res) => {
  try {
    const user = readOptionalUser(req);
    if (!(await optionalAdminHasFeature(user, "canViewQuestions"))) {
      return res.status(403).json({ message: "Question viewing access denied" });
    }
    const suite = await TestSuite.findById(req.params.id);
    if (!canAccessSuite(suite, user)) {
      return res.status(403).json({ message: "This test is not available" });
    }
    const questions = await Question.find({ testSuite: req.params.id }).sort({ createdAt: 1, _id: 1 });
    const visibleQuestions = user?.role === "candidate"
      ? selectQuestionsForSuite(suite, questions)
      : questions;
    res.json(visibleQuestions);
  } catch (err) {
    res.status(500).json({ message: "Error fetching questions" });
  }
});

// ── ADD QUESTION TO A SUITE ───────────────────────────────────
router.post("/:id/questions", authMiddleware, requireAdminFeature("canManageQuestions", "Question management access denied"), async (req, res) => {
  try {
    const questionType = req.body.questionType === "theory" ? "theory" : "mcq";
    const categories = Array.isArray(req.body.category)
      ? req.body.category
      : (req.body.category ? [req.body.category] : []);
    const options = Array.isArray(req.body.options)
      ? req.body.options.filter(o => String(o).trim() !== "")
      : [];
    const optionScores = questionType === "theory"
      ? []
      : (Array.isArray(req.body.optionScores)
        ? req.body.optionScores.slice(0, options.length).map(Number).map(score => Number.isFinite(score) ? score : 0)
        : []);
    const correctAnswer = Array.isArray(req.body.correctAnswer)
      ? req.body.correctAnswer
      : req.body.correctAnswer !== undefined ? [req.body.correctAnswer] : [];
    const finalCorrectAnswer = questionType === "theory"
      ? []
      : correctAnswer.length > 0 ? correctAnswer : maxScoreIndexes(optionScores);
    const newQuestion = new Question({
      ...req.body,
      imageUrl: sanitizeImageUrl(req.body.imageUrl),
      videoUrl: sanitizeVideoUrl(req.body.videoUrl),
      questionType,
      options: questionType === "theory" ? [] : options,
      correctAnswer: finalCorrectAnswer,
      optionScores,
      category: categories,
      categoryCorrectAnswers: questionType === "theory"
        ? {}
        : sanitizeCategoryCorrectAnswers(
          req.body.categoryCorrectAnswers,
          categories,
          options.length,
          options
        ),
      testSuite: req.params.id,
    });
    const saved = await newQuestion.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("Add Question Error:", err);
    res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : "Error adding question" });
  }
});

// ── IMPORT QUESTIONS FROM EXCEL ───────────────────────────────
router.post("/:id/import-excel", authMiddleware, requireAdminFeature("canManageQuestions", "Question import access denied"), upload.single("file"), async (req, res) => {
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

      const correctAnswer = parseCorrectAnswerIndexes(
        row.correctAnswers || row.CorrectAnswers || row.correctAnswer || row.CorrectAnswer || row.correct || row.answer || "",
        options
      );
      const optionScores = questionType === "theory" ? [] : parseOptionScoresFromRow(row, options);
      const inferredCorrectAnswer = correctAnswer.length > 0 ? correctAnswer : maxScoreIndexes(optionScores);
      if (questionType === "mcq" && inferredCorrectAnswer.length === 0) {
        errors.push(`Row ${rowNum}: invalid correctAnswers`);
        return;
      }

      const rawCat = String(row.category || row.Category || "").trim();
      const category = rawCat.split(",").map(s => s.trim()).filter(Boolean);
      const categoryCorrectAnswers = sanitizeCategoryCorrectAnswers(
        row.categoryCorrectAnswers || row.CategoryCorrectAnswers || row.categoryAnswers || row.CategoryAnswers,
        category,
        options.length,
        options
      );

      try {
        questions.push({
          testSuite: req.params.id,
          questionText,
          imageUrl: sanitizeImageUrl(row.imageUrl || row.ImageUrl || row.image || row.Image || row.picture || row.Picture || ""),
          videoUrl: sanitizeVideoUrl(row.videoUrl || row.VideoUrl || row.video || row.Video || ""),
          questionType,
          options: questionType === "theory" ? [] : options,
          correctAnswer: questionType === "theory" ? [] : inferredCorrectAnswer,
          optionScores,
          categoryCorrectAnswers: questionType === "theory" ? {} : categoryCorrectAnswers,
          explanation: String(row.explanation || row.Explanation || "").trim(),
          marks: parseInt(row.marks || row.Marks || 1, 10) || 1,
          language: String(row.language || row.Language || "en").trim(),
          category,
        });
      } catch (err) {
        errors.push(`Row ${rowNum}: ${err.message}`);
      }
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
    if (!(await optionalAdminHasFeature(user, "canViewSuites"))) {
      return res.status(403).json({ message: "Test suite viewing access denied" });
    }
    const query = !user
      ? { status: "active", isPublic: { $ne: false } }
      : user.role === "candidate"
        ? {
            status: "active",
            deletedAt: null,
            $or: [
              { isPublic: { $ne: false } },
              { assignedUsers: user.id },
            ],
          }
        : { deletedAt: null };
    if (!user) query.deletedAt = null;
    const suites = await TestSuite.find(query).sort({ createdAt: -1 });
    const suitesWithCount = await Promise.all(
      suites.map(async (suite) => {
        const totalCount = await Question.countDocuments({ testSuite: suite._id });
        const effectiveCount = getEffectiveQuestionCount(suite, totalCount);
        const mode = resolveQuestionSelectionMode(suite);
        return {
          ...suite.toObject(),
          questionSelectionMode: mode,
          questionCount: user?.role === "candidate" ? effectiveCount : totalCount,
          totalQuestionCount: totalCount,
          effectiveQuestionCount: effectiveCount,
        };
      })
    );
    res.json(suitesWithCount);
  } catch (err) {
    res.status(500).json({ message: "Error fetching suites" });
  }
});

// ── CREATE NEW SUITE ──────────────────────────────────────────
router.post("/", authMiddleware, requireAdminFeature("canManageSuites", "Test suite management access denied"), async (req, res) => {
  try {
    const { name, description, status, passingPercentage, scoringMode } = req.body;
    const newSuite = new TestSuite({
      name,
      description,
      status: status || "draft",
      passingPercentage: normalizePassingPercentage(passingPercentage),
      scoringMode: scoringMode === "sixteen_pf" ? "sixteen_pf" : "standard",
    });
    const savedSuite = await newSuite.save();
    res.status(201).json(savedSuite);
  } catch (err) {
    console.error("Create Suite Error:", err);
    res.status(500).json({ message: "Error creating test suite" });
  }
});

// ── ASSIGN SUITE TO SPECIFIC USERS ───────────────────────────
router.put("/assignments/user/:userId", authMiddleware, requireAdminFeature("canAssignTests", "Test assignment access denied"), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("_id role isActive");
    if (!user || !["candidate", "admin"].includes(user.role) || user.isActive === false) {
      return res.status(404).json({ message: "Active candidate or admin not found" });
    }

    const selectedSuiteIds = [...new Set(
      (Array.isArray(req.body.suiteIds) ? req.body.suiteIds : [])
        .map(id => String(id))
        .filter(Boolean)
    )];

    const suites = await TestSuite.find({ deletedAt: null });
    const updatedSuites = [];
    const assignedAt = new Date();
    for (const suite of suites) {
      const shouldAssign = selectedSuiteIds.includes(String(suite._id));
      const currentAssigned = (suite.assignedUsers || []).map(id => String(id));
      const currentMeta = assignedMetaById(suite);
      const nextAssigned = shouldAssign
        ? [...new Set([...currentAssigned, String(user._id)])]
        : currentAssigned.filter(id => id !== String(user._id));

      const shouldUpdate =
        shouldAssign ||
        currentAssigned.length !== nextAssigned.length ||
        currentAssigned.some(id => !nextAssigned.includes(id));

      if (!shouldUpdate) {
        updatedSuites.push(suite);
        continue;
      }

      suite.isPublic = shouldAssign ? false : suite.isPublic;
      suite.assignedUsers = nextAssigned;
      suite.assignedUsersMeta = nextAssigned.map(id => ({
        user: id,
        assignedAt: shouldAssign && id === String(user._id)
          ? assignedAt
          : currentMeta.get(id) || assignedAt,
      }));
      updatedSuites.push(await suite.save());
    }

    res.json(updatedSuites);
  } catch (err) {
    console.error("User assignment update error:", err);
    res.status(500).json({ message: "Error updating user suite assignments" });
  }
});

// ── UPDATE SUITE ──────────────────────────────────────────────
router.put("/:id", authMiddleware, requireAdminFeature("canManageSuites", "Test suite management access denied"), async (req, res) => {
  try {
    const payload = sanitizeSuiteUpdatePayload(req.body);
    const updatedSuite = await TestSuite.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: payload },
      { new: true }
    );
    if (!updatedSuite) return res.status(404).json({ message: "Suite not found" });
    res.json(updatedSuite);
  } catch (err) {
    res.status(500).json({ message: "Error updating suite" });
  }
});

router.put("/:id/assignments", authMiddleware, requireAdminFeature("canAssignTests", "Test assignment access denied"), async (req, res) => {
  try {
    const assignedUsers = Array.isArray(req.body.assignedUsers)
      ? req.body.assignedUsers.filter(Boolean)
      : [];
    const isPublic = req.body.isPublic !== false;
    const assignedAt = new Date();
    const suite = await TestSuite.findOne({ _id: req.params.id, deletedAt: null });
    if (!suite) return res.status(404).json({ message: "Suite not found" });
    const currentMeta = assignedMetaById(suite);
    suite.isPublic = isPublic;
    suite.assignedUsers = isPublic ? [] : assignedUsers;
    suite.assignedUsersMeta = isPublic ? [] : assignedUsers.map(id => ({
      user: id,
      assignedAt: currentMeta.get(String(id)) || assignedAt,
    }));
    const updatedSuite = await suite.save();
    res.json(updatedSuite);
  } catch (err) {
    res.status(500).json({ message: "Error updating suite assignments" });
  }
});

// ── DELETE SUITE ──────────────────────────────────────────────
router.delete("/:id", authMiddleware, requireAdminFeature("canManageSuites", "Test suite management access denied"), async (req, res) => {
  try {
    if (!(await requireCurrentPassword(req, res))) return;
    const suite = await TestSuite.findOne({ _id: req.params.id, deletedAt: null });
    if (!suite) return res.status(404).json({ message: "Suite not found" });
    suite.status = "inactive";
    suite.deletedAt = new Date();
    suite.deletedBy = req.user.id;
    await suite.save();
    res.json({ message: "Suite moved to trash", suite });
  } catch (err) {
    res.status(500).json({ message: "Error deleting suite" });
  }
});

// ── GET TRASHED SUITES ────────────────────────────────────────
router.get("/trash/list", authMiddleware, requireAdminFeature("canManageSuites", "Test suite management access denied"), async (req, res) => {
  try {
    const suites = await TestSuite.find({ deletedAt: { $ne: null } })
      .populate("deletedBy", "name email username")
      .sort({ deletedAt: -1 });
    const suitesWithCount = await Promise.all(
      suites.map(async (suite) => ({
        ...suite.toObject(),
        questionCount: await Question.countDocuments({ testSuite: suite._id }),
      }))
    );
    res.json(suitesWithCount);
  } catch (err) {
    res.status(500).json({ message: "Error fetching trashed suites" });
  }
});

// ── RECOVER TRASHED SUITE ─────────────────────────────────────
router.put("/:id/recover", authMiddleware, requireAdminFeature("canManageSuites", "Test suite management access denied"), async (req, res) => {
  try {
    const suite = await TestSuite.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!suite) return res.status(404).json({ message: "Trashed suite not found" });
    suite.deletedAt = null;
    suite.deletedBy = null;
    suite.status = req.body?.status && ["draft", "active", "scheduled", "inactive"].includes(req.body.status)
      ? req.body.status
      : "draft";
    const recovered = await suite.save();
    const questionCount = await Question.countDocuments({ testSuite: recovered._id });
    res.json({ ...recovered.toObject(), questionCount });
  } catch (err) {
    res.status(500).json({ message: "Error recovering suite" });
  }
});

// ── PERMANENTLY DELETE TRASHED SUITE ──────────────────────────
router.delete("/:id/permanent", authMiddleware, requireAdminFeature("canManageSuites", "Test suite management access denied"), async (req, res) => {
  try {
    if (!(await requireCurrentPassword(req, res))) return;
    const suite = await TestSuite.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!suite) return res.status(404).json({ message: "Trashed suite not found" });
    await Question.deleteMany({ testSuite: req.params.id });
    await TestSuite.findByIdAndDelete(req.params.id);
    res.json({ message: "Suite permanently deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error permanently deleting suite" });
  }
});

// ── GET SINGLE SUITE DETAILS ──────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const user = readOptionalUser(req);
    if (!(await optionalAdminHasFeature(user, "canViewSuites"))) {
      return res.status(403).json({ message: "Test suite viewing access denied" });
    }
    const suite = await TestSuite.findById(req.params.id);
    if (!suite) return res.status(404).json({ message: "Suite not found" });
    if (!canAccessSuite(suite, user)) {
      return res.status(403).json({ message: "This test is not available" });
    }
    res.json(suite);
  } catch (err) {
    res.status(500).json({ message: "Error fetching suite details" });
  }
});

module.exports = router;
