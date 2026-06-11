const express = require("express");
const router  = express.Router();
const Result   = require("../models/Result");
const Question = require("../models/Question");
const TestSuite = require("../models/TestSuite");
const Settings = require("../models/ExamSettings"); 

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

// ══════════════════════════════════════════════════════════════
// POST /api/results
// Full graded submission logic
// ══════════════════════════════════════════════════════════════
router.post("/", async (req, res) => {
  try {
    const {
      suiteId,
      CandidateName,
      CandidateEmail,
      answers,
      project,
      designation,
      testName,
    } = req.body;

    // Fetch data and settings
    const [questions, settings, suite] = await Promise.all([
      Question.find({ testSuite: suiteId }),
      Settings.findOne(),
      TestSuite.findById(suiteId),
    ]);

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

    const result = new Result({
      suiteId,
      testName:       suite?.name || testName || "",
      CandidateName,
      CandidateEmail,
      userName:       CandidateName,
      userEmail:      CandidateEmail,
      answers:        gradedAnswers,
      score:          Math.round(score * 100) / 100,
      totalMarks,
      correctAnswers: correctCount,
      totalQuestions: questions.length,
      categoryResults,
      project:        project     || "General",
      designation:    designation || "",
      passed,
      submittedAt:    new Date(),
    });

    await result.save();

    res.status(201).json({
      score: result.score,
      totalMarks,
      correctAnswers: correctCount,
      totalQuestions: questions.length,
      categoryResults,
      passed,
    });

  } catch (err) {
    console.error("Result Submission Error:", err);
    res.status(500).json({ message: "Error submitting result" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/suite/:suiteId
// ══════════════════════════════════════════════════════════════
router.get("/suite/:suiteId", async (req, res) => {
  try {
    const results = await Result.find({ suiteId: req.params.suiteId })
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
router.get("/all", async (req, res) => {
  try {
    const { search, project } = req.query;
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
router.get("/projects", async (req, res) => {
  try {
    const projects = await Result.distinct("project");
    res.json(projects.filter(Boolean));
  } catch (err) {
    res.status(500).json({ message: "Error Fetching Projects" });
  }
});

// Utility: Delete All
router.get("/delete-all", async (req, res) => {
  try {
    await Result.deleteMany({});
    res.json({ message: "All Results Deleted Successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error Deleting Results" });
  }
});

module.exports = router;
