const express = require("express");
const router  = express.Router();
const bcrypt = require("bcryptjs");
const Result   = require("../models/Result");
const Question = require("../models/Question");
const TestSuite = require("../models/TestSuite");
const Settings = require("../models/ExamSettings"); 
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const {
  hasAdminPermission,
  scopedResultQuery,
} = require("../utils/adminPermissions");

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

function getQuestionCats(q) {
  if (Array.isArray(q.category) && q.category.length > 0) return q.category;
  if (typeof q.category === "string" && q.category.trim()) return [q.category.trim()];
  return ["Uncategorized"];
}

function getCategoryAnswerMap(q) {
  const rawMap = q.categoryCorrectAnswers;
  if (!rawMap) return {};
  if (rawMap instanceof Map) return Object.fromEntries(rawMap);
  if (typeof rawMap.toObject === "function") return rawMap.toObject();
  return rawMap;
}

function uniqueIndexes(indexes) {
  return [...new Set((Array.isArray(indexes) ? indexes : []).map(Number))]
    .filter(Number.isInteger);
}

function getCorrectAnswersForCategory(q, cat) {
  const fallback = uniqueIndexes(Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]);
  const map = getCategoryAnswerMap(q);
  const categoryAnswers = uniqueIndexes(map[cat]);
  return categoryAnswers.length > 0 ? categoryAnswers : fallback;
}

function scoreSelected(selectedArr, correctArr) {
  if (correctArr.length === 0) return { earnedFrac: 0, isRight: false };
  const hits = selectedArr.filter(i => correctArr.includes(i)).length;
  const wrongs = selectedArr.filter(i => !correctArr.includes(i)).length;
  const earnedFrac = Math.max(0, (hits - wrongs) / correctArr.length);
  return { earnedFrac, isRight: earnedFrac === 1 };
}

function isTheoryQuestion(q) {
  return q?.questionType === "theory";
}

function isSyntheticMobileEmail(email) {
  return /@mobile\.local$/i.test(String(email || ""));
}

function canAccessSuite(suite, user) {
  if (!suite || !user) return false;
  if (user.role !== "candidate") return true;
  if (suite.status !== "active") return false;
  return true;
}

function metaUserId(entry) {
  return String(entry?.user?._id || entry?.user || "");
}

function assignmentDateForUser(suite, userId) {
  const match = (suite?.assignedUsersMeta || []).find(entry => metaUserId(entry) === String(userId));
  return match?.assignedAt ? new Date(match.assignedAt) : null;
}

async function candidateResultFilter(userId) {
  const user = await User.findById(userId).select("name username email mobile");
  if (!user) return { _id: null };
  const tokens = [user.name, user.username, user.email, user.mobile].filter(Boolean);
  if (tokens.length === 0) return { _id: null };
  return {
    $or: tokens.flatMap(token => {
      const regex = new RegExp(String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      return [{ userName: regex }, { userEmail: regex }, { CandidateName: regex }, { CandidateEmail: regex }];
    }),
  };
}

async function getRequester(userId) {
  return User.findById(userId).select("role adminPermissions name username email mobile");
}

function andQuery(base, extra) {
  const clauses = [];
  if (Object.keys(base).length > 0) clauses.push(base);
  if (Object.keys(extra).length > 0) clauses.push(extra);
  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

async function userResultFilter(userId) {
  const user = await User.findById(userId).select("name username email mobile");
  if (!user) return { _id: null };
  const tokens = [user.email, user.mobile, user.username, user.name].filter(Boolean);
  if (tokens.length === 0) return { _id: null };
  return {
    $or: tokens.flatMap(token => {
      const regex = new RegExp(String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      return [
        { userName: regex },
        { userEmail: regex },
        { CandidateName: regex },
        { CandidateEmail: regex },
      ];
    }),
  };
}

function dateRangeQuery(fromDate, toDate) {
  const submittedAt = {};
  if (fromDate) {
    const start = new Date(fromDate);
    if (!Number.isNaN(start.getTime())) submittedAt.$gte = start;
  }
  if (toDate) {
    const end = new Date(toDate);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      submittedAt.$lte = end;
    }
  }
  return Object.keys(submittedAt).length ? { submittedAt } : {};
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

// ══════════════════════════════════════════════════════════════
// POST /api/results
// Full graded submission logic
// ══════════════════════════════════════════════════════════════
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      suiteId,
      CandidateName,
      CandidateEmail,
      answers,
      project,
      designation,
      testName,
      startedAt,
      timeTakenSeconds,
    } = req.body;

    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: "Answers are required" });
    }
    const answeredQuestionIds = [...new Set(
      answers.map(answer => String(answer?.questionId || "")).filter(Boolean)
    )];

    const [questions, settings, suite, submitter] = await Promise.all([
      answeredQuestionIds.length
        ? Question.find({ testSuite: suiteId, _id: { $in: answeredQuestionIds } }).sort({ createdAt: 1, _id: 1 })
        : Promise.resolve([]),
      Settings.findOne(),
      TestSuite.findById(suiteId),
      req.user.role === "candidate"
        ? User.findById(req.user.id).select("name username email mobile project designation")
        : Promise.resolve(null),
    ]);

    if (!suite) return res.status(404).json({ message: "Test suite not found" });
    if (!canAccessSuite(suite, req.user)) {
      return res.status(403).json({ message: "This test is not available" });
    }

    if (req.user.role === "candidate") {
      const candidateFilter = await candidateResultFilter(req.user.id);
      const latestPassed = await Result.findOne(andQuery(
        { suiteId, passed: true },
        candidateFilter
      )).sort({ submittedAt: -1 });
      const assignedAt = assignmentDateForUser(suite, req.user.id);
      if (latestPassed && (!assignedAt || new Date(latestPassed.submittedAt) >= assignedAt)) {
        return res.status(409).json({
          message: "You already attempted this test and passed. Please contact the admin for a new assignment.",
        });
      }
    }

    const passingPct = suite?.passingPercentage ?? settings?.passingPercentage ?? 50;
    let score        = 0;
    let totalMarks   = 0;
    let correctCount = 0;
    const categoryMap = {};

    const gradedAnswers = answers.map(({ questionId, selectedOptions, textAnswer }) => {
      const q = questions.find(q => q._id.toString() === questionId);
      if (!q) return { questionId, selectedOptions: selectedOptions || [], textAnswer: textAnswer || "", isCorrect: false };

      if (isTheoryQuestion(q)) {
        return {
          questionId,
          selectedOptions: [],
          textAnswer: String(textAnswer || "").trim(),
          isCorrect: false,
          earnedMarks: 0,
          category: getQuestionCats(q),
        };
      }

      const marks = q.marks ?? 1;
      totalMarks += marks;

      const selectedArr = Array.isArray(selectedOptions) ? selectedOptions : [];
      const cats = getQuestionCats(q);
      const categoryScores = cats.map(cat => {
        const correctArr = getCorrectAnswersForCategory(q, cat);
        const scored = scoreSelected(selectedArr, correctArr);
        return { cat, correctArr, ...scored };
      });
      const bestEarnedFrac = categoryScores.length
        ? Math.max(...categoryScores.map(s => s.earnedFrac))
        : 0;

      const isRight = bestEarnedFrac === 1;

      const earnedMarks = bestEarnedFrac * marks;
      score += earnedMarks;
      if (isRight) correctCount++;

      // Map Categories for breakdown
      categoryScores.forEach(({ cat, earnedFrac }) => {
        if (!categoryMap[cat]) categoryMap[cat] = { earned: 0, total: 0 };
        categoryMap[cat].total += marks;
        categoryMap[cat].earned += earnedFrac * marks;
      });

      return {
        questionId,
        selectedOptions: selectedArr,
        textAnswer: "",
        isCorrect: isRight,
        earnedMarks,
        category: cats
      };
    });

    // Build categoryResults array
    const categoryResults = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      score:      Math.round(data.earned * 100) / 100,
      total:      data.total,
      earnedMarks: Math.round(data.earned * 100) / 100,
      percentage: data.total > 0 ? Math.round((data.earned / data.total) * 100) : 0,
    }));

    const pct    = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
    const passed = pct >= passingPct;
    const storedName = submitter?.name || CandidateName || "Candidate";
    const storedEmail = submitter
      ? (isSyntheticMobileEmail(submitter.email) ? submitter.mobile || submitter.username || "" : submitter.email || submitter.mobile || submitter.username || "")
      : CandidateEmail;
    const storedProject = submitter?.project || project || "General";
    const storedDesignation = submitter?.designation || designation || "";
    const submittedAt = new Date();
    const parsedStartedAt = startedAt ? new Date(startedAt) : null;
    const safeStartedAt = parsedStartedAt && !Number.isNaN(parsedStartedAt.getTime())
      ? parsedStartedAt
      : undefined;
    const parsedTimeTaken = Number(timeTakenSeconds);
    const safeTimeTaken = Number.isFinite(parsedTimeTaken)
      ? Math.max(0, Math.round(parsedTimeTaken))
      : safeStartedAt
        ? Math.max(0, Math.round((submittedAt.getTime() - safeStartedAt.getTime()) / 1000))
        : null;

    const result = new Result({
      suiteId,
      testName:       suite?.name || testName || "",
      CandidateName:  storedName,
      CandidateEmail: storedEmail,
      userName:       storedName,
      userEmail:      storedEmail,
      answers:        gradedAnswers,
      score:          Math.round(score * 100) / 100,
      totalMarks,
      correctAnswers: correctCount,
      totalQuestions: questions.length,
      categoryResults,
      project:        storedProject,
      designation:    storedDesignation,
      passed,
      startedAt:      safeStartedAt,
      submittedAt,
      timeTakenSeconds: safeTimeTaken,
    });

    await result.save();

    res.status(201).json({
      score: result.score,
      totalMarks,
      correctAnswers: correctCount,
      totalQuestions: questions.length,
      categoryResults,
      passed,
      startedAt: result.startedAt,
      submittedAt: result.submittedAt,
      timeTakenSeconds: result.timeTakenSeconds,
    });

  } catch (err) {
    console.error("Result Submission Error:", err);
    res.status(500).json({ message: "Error submitting result" });
  }
});

// Legacy compatibility for old admin test page.
router.post("/add", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const result = new Result({
      ...req.body,
      CandidateName: req.body.CandidateName || req.body.userName,
      CandidateEmail: req.body.CandidateEmail || req.body.userEmail,
      submittedAt: new Date(),
    });
    await result.save();
    res.status(201).json(result);
  } catch (err) {
    console.error("Legacy result add error:", err);
    res.status(500).json({ message: "Error submitting result" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/suite/:suiteId
// ══════════════════════════════════════════════════════════════
router.get("/suite/:suiteId", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const requester = await getRequester(req.user.id);
    if (requester?.role === "admin" && !hasAdminPermission(requester, "canViewReports")) {
      return res.status(403).json({ message: "Report access denied" });
    }
    const query = andQuery(
      { suiteId: req.params.suiteId },
      requester?.role === "admin" ? scopedResultQuery(requester) : {}
    );
    const results = await Result.find(query)
      .populate("suiteId", "name passingPercentage")
      .sort({ submittedAt: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Error fetching suite results" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/all (With Search and Project Filtering)
// ══════════════════════════════════════════════════════════════
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const { search, project } = req.query;
    const requester = await getRequester(req.user.id);
    const query = {};

    if (project && project.trim() !== "") {
      query.project = project.trim();
    }

    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { userName: regex },
        { userEmail: regex },
        { project: regex },
        { designation: regex },
        { testName: regex },
      ];
    }

    if (req.user.role === "candidate") {
      const candidateFilter = await candidateResultFilter(req.user.id);
      if (query.$or) {
        query.$and = [{ $or: query.$or }, candidateFilter];
        delete query.$or;
      } else {
        Object.assign(query, candidateFilter);
      }
    } else if (requester?.role === "admin") {
      if (!hasAdminPermission(requester, "canViewReports")) {
        return res.status(403).json({ message: "Report access denied" });
      }
      const scoped = scopedResultQuery(requester);
      if (Object.keys(scoped).length > 0) {
        const current = { ...query };
        Object.keys(query).forEach(key => delete query[key]);
        Object.assign(query, andQuery(current, scoped));
      }
    }

    const results = await Result.find(query)
      .populate("suiteId", "name passingPercentage")
      .sort({ submittedAt: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Error Fetching Results" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/projects (For filter dropdown)
// ══════════════════════════════════════════════════════════════
router.get("/projects", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const requester = await getRequester(req.user.id);
    if (requester?.role === "admin" && !hasAdminPermission(requester, "canViewReports")) {
      return res.status(403).json({ message: "Report access denied" });
    }
    const projects = await Result.distinct("project", requester?.role === "admin" ? scopedResultQuery(requester) : {});
    res.json(projects.filter(Boolean));
  } catch (err) {
    res.status(500).json({ message: "Error Fetching Projects" });
  }
});

// Delete results for one suite, optionally filtered by date range and user.
router.delete("/suite/:suiteId", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
  try {
    if (!(await requireCurrentPassword(req, res))) return;
    const requester = await getRequester(req.user.id);
    if (requester?.role === "admin" && !hasAdminPermission(requester, "canManageSuites")) {
      return res.status(403).json({ message: "Result deletion access denied" });
    }

    const { fromDate, toDate, userId } = req.body || {};
    let query = andQuery(
      { suiteId: req.params.suiteId },
      requester?.role === "admin" ? scopedResultQuery(requester) : {}
    );
    query = andQuery(query, dateRangeQuery(fromDate, toDate));
    if (userId) {
      query = andQuery(query, await userResultFilter(userId));
    }

    const deletion = await Result.deleteMany(query);
    res.json({
      message: "Results deleted successfully",
      deletedCount: deletion.deletedCount || 0,
    });
  } catch (err) {
    console.error("Result deletion error:", err);
    res.status(500).json({ message: "Error deleting results" });
  }
});

// Utility: Delete All
router.get("/delete-all", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    await Result.deleteMany({});
    res.json({ message: "All Results Deleted Successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error Deleting Results" });
  }
});

module.exports = router;
