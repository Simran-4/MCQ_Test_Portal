const express = require("express");
const router  = express.Router();
const bcrypt = require("bcryptjs");
const Result   = require("../models/Result");
const Question = require("../models/Question");
const TestSuite = require("../models/TestSuite");
const Settings = require("../models/ExamSettings"); 
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { canAccessSuite } = require("../utils/suiteAccess");
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

const factorDescriptions = {
  A: {
    low: "Reserved, detached, critical, aloof, stiff.",
    average: "Balanced warmth and reserve.",
    high: "Outgoing, warmhearted, easy-going, participating.",
  },
  B: {
    low: "Concrete thinking and lower scholastic mental capacity.",
    average: "Balanced concrete and abstract reasoning.",
    high: "Abstract thinking, bright, higher scholastic mental capacity.",
  },
  C: {
    low: "Affected by feelings, emotionally less stable, easily upset, changeable.",
    average: "Moderate emotional steadiness.",
    high: "Emotionally stable, mature, faces reality, calm.",
  },
  E: {
    low: "Humble, mild, easily led, docile, accommodating.",
    average: "Balanced assertiveness and accommodation.",
    high: "Assertive, aggressive, stubborn, competitive.",
  },
  F: {
    low: "Sober, prudent, taciturn, serious.",
    average: "Moderate liveliness and restraint.",
    high: "Happy-go-lucky, impulsively lively, enthusiastic.",
  },
  G: {
    low: "Expedient, disregards rules, feels few obligations.",
    average: "Moderate rule-consciousness.",
    high: "Conscientious, persistent, moralistic, staid.",
  },
  H: {
    low: "Shy, timid, restrained, threat-sensitive.",
    average: "Moderate social boldness.",
    high: "Venturesome, uninhibited, socially bold, spontaneous.",
  },
  I: {
    low: "Tough-minded, self-reliant, realistic, no-nonsense.",
    average: "Balanced sensitivity and practicality.",
    high: "Tender-minded, sensitive, clinging, overprotected.",
  },
  L: {
    low: "Trusting, adaptable, free of jealousy, easy to get on with.",
    average: "Balanced trust and skepticism.",
    high: "Suspicious, self-opinionated, hard to fool.",
  },
  M: {
    low: "Practical, careful, conventional, regulated by external realities.",
    average: "Balanced practicality and imagination.",
    high: "Imaginative, wrapped up in inner urgencies, careless of practical matters.",
  },
  N: {
    low: "Forthright, unpretentious, genuine, socially clumsy.",
    average: "Balanced openness and social polish.",
    high: "Shrewd, calculating, worldly, penetrating.",
  },
  O: {
    low: "Placid, self-assured, confident, serene.",
    average: "Moderate apprehension and confidence.",
    high: "Apprehensive, self-reproaching, insecure, worrying, troubled.",
  },
  Q1: {
    low: "Conservative, respecting established ideas, tolerant of traditional difficulties.",
    average: "Moderate openness to change.",
    high: "Experimenting, critical, liberal, analytical, free-thinking.",
  },
  Q2: {
    low: "Group-dependent, a joiner and sound follower.",
    average: "Balanced group support and independence.",
    high: "Self-sufficient, prefers own decisions, resourceful.",
  },
  Q3: {
    low: "Undisciplined self-conflict, follows own urges, careless of protocol.",
    average: "Moderate self-control.",
    high: "Controlled, exacting will power, socially precise, following self-image.",
  },
  Q4: {
    low: "Relaxed, tranquil, torpid, unfrustrated.",
    average: "Moderate tension and drive.",
    high: "Tense, frustrated, driven, overwrought.",
  },
};

function normalizeFactorKey(category) {
  const text = String(category || "").toUpperCase().replace(/[–—-]/g, " ");
  const qMatch = text.match(/\bQ\s*([1-4])\b/);
  if (qMatch) return `Q${qMatch[1]}`;
  const factorMatch = text.match(/\bFACTOR\s+([A-Z])\b/);
  if (factorMatch) return factorMatch[1];
  const single = text.trim().match(/^([A-Z])$/);
  return single ? single[1] : text.trim();
}

function scaleFromPercentage(percentage) {
  if (!Number.isFinite(percentage)) return 1;
  return Math.max(1, Math.min(10, Math.round((percentage / 100) * 9 + 1)));
}

function scaleLabel(scaleScore) {
  if (scaleScore <= 3) return "Low";
  if (scaleScore >= 8) return "High";
  return "Average";
}

function factorDescriptionFor(category, label) {
  const meta = factorDescriptions[normalizeFactorKey(category)];
  if (!meta) return "";
  return meta[String(label || "").toLowerCase()] || "";
}

function normalizedOptionScores(q) {
  const scores = Array.isArray(q?.optionScores) ? q.optionScores.map(Number) : [];
  return scores.map(score => Number.isFinite(score) ? score : 0);
}

function isNeutralSelection(q, selectedArr) {
  if (!Array.isArray(selectedArr) || selectedArr.length !== 1) return false;
  const optionText = String(q?.options?.[selectedArr[0]] || "");
  return /neutral|cannot say|can't say|uncertain|not sure|तटस्थ|निश्चित/i.test(optionText);
}

function isFactorB(category) {
  return normalizeFactorKey(category) === "B";
}

function scoreSixteenPfQuestion(q, selectedArr, correctArr, category) {
  const scores = normalizedOptionScores(q);
  const selectedIndex = Array.isArray(selectedArr) && selectedArr.length === 1 ? Number(selectedArr[0]) : null;
  if (scores.length > 0) {
    const maxScore = Math.max(...scores, 0);
    if (maxScore > 0) {
      const earned = Number.isInteger(selectedIndex) ? Math.max(0, Number(scores[selectedIndex] || 0)) : 0;
      const boundedEarned = Math.min(earned, maxScore);
      return {
        earned: boundedEarned,
        maxScore,
        earnedFrac: boundedEarned / maxScore,
        isRight: boundedEarned === maxScore,
      };
    }
  }

  const maxScore = isFactorB(category) ? 1 : 2;
  const isCorrect = selectedArr.some(index => correctArr.includes(index));
  const earned = isCorrect ? maxScore : isNeutralSelection(q, selectedArr) && !isFactorB(category) ? 1 : 0;
  return {
    earned,
    maxScore,
    earnedFrac: maxScore > 0 ? earned / maxScore : 0,
    isRight: maxScore > 0 && earned === maxScore,
  };
}

function summarizeSixteenPfScores(categoryScores) {
  const totals = categoryScores.reduce((acc, item) => {
    acc.earned += Number(item.earned || 0);
    acc.maxScore += Number(item.maxScore || 0);
    return acc;
  }, { earned: 0, maxScore: 0 });
  return {
    ...totals,
    earnedFrac: totals.maxScore > 0 ? totals.earned / totals.maxScore : 0,
    isRight: totals.maxScore > 0 && categoryScores.every(item => item.isRight),
  };
}

function isTheoryQuestion(q) {
  return q?.questionType === "theory";
}

function isSyntheticMobileEmail(email) {
  return /@mobile\.local$/i.test(String(email || ""));
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

function canReadAnyReport(user) {
  return hasAdminPermission(user, "canViewReports") || hasAdminPermission(user, "canViewTestReports");
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
    const isSixteenPf = suite?.scoringMode === "sixteen_pf";
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

      const selectedArr = uniqueIndexes(Array.isArray(selectedOptions) ? selectedOptions : []);
      const cats = getQuestionCats(q);
      const categoryScores = cats.map(cat => {
        const correctArr = getCorrectAnswersForCategory(q, cat);
        if (isSixteenPf) {
          return { cat, correctArr, ...scoreSixteenPfQuestion(q, selectedArr, correctArr, cat) };
        }
        const scored = scoreSelected(selectedArr, correctArr);
        return { cat, correctArr, ...scored, earned: scored.earnedFrac * marks, maxScore: marks };
      });
      const bestScore = categoryScores.reduce((winner, current) =>
        current.earnedFrac > winner.earnedFrac ? current : winner,
        { earnedFrac: 0, earned: 0, maxScore: isSixteenPf ? 0 : marks }
      );
      const questionScore = isSixteenPf ? summarizeSixteenPfScores(categoryScores) : bestScore;
      const questionMax = isSixteenPf ? questionScore.maxScore : marks;
      totalMarks += questionMax;

      const isRight = isSixteenPf ? questionScore.isRight : bestScore.earnedFrac === 1;

      const earnedMarks = isSixteenPf ? questionScore.earned : bestScore.earnedFrac * marks;
      score += earnedMarks;
      if (isRight) correctCount++;

      // Map Categories for breakdown
      categoryScores.forEach(({ cat, earnedFrac, earned, maxScore }) => {
        if (!categoryMap[cat]) categoryMap[cat] = { earned: 0, total: 0 };
        categoryMap[cat].total += isSixteenPf ? maxScore : marks;
        categoryMap[cat].earned += isSixteenPf ? earned : earnedFrac * marks;
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
    const categoryResults = Object.entries(categoryMap).map(([category, data]) => {
      const percentage = data.total > 0 ? Math.round((data.earned / data.total) * 100) : 0;
      const scaleScore = isSixteenPf ? scaleFromPercentage(percentage) : null;
      const label = isSixteenPf ? scaleLabel(scaleScore) : "";
      return {
        category,
        score:      Math.round(data.earned * 100) / 100,
        total:      data.total,
        earnedMarks: Math.round(data.earned * 100) / 100,
        percentage,
        scaleScore,
        scaleLabel: label,
        description: isSixteenPf ? factorDescriptionFor(category, label) : "",
      };
    });

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
    if (requester?.role === "admin" && !canReadAnyReport(requester)) {
      return res.status(403).json({ message: "Report access denied" });
    }
    const query = andQuery(
      { suiteId: req.params.suiteId },
      requester?.role === "admin" ? scopedResultQuery(requester) : {}
    );
    const results = await Result.find(query)
      .populate("suiteId", "name passingPercentage")
      .populate("answers.questionId", "questionText questionType options correctAnswer optionScores categoryCorrectAnswers marks category")
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
      if (!canReadAnyReport(requester)) {
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
      .populate("answers.questionId", "questionText questionType options correctAnswer optionScores categoryCorrectAnswers marks category")
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
    if (requester?.role === "admin" && !canReadAnyReport(requester)) {
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
