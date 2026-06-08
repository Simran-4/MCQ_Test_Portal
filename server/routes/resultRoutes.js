const express = require("express");
const router  = express.Router();
const Result   = require("../models/Result");
const Question = require("../models/Question");
const Settings = require("../models/Settings"); 

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
    } = req.body;

    // Fetch data and settings
    const [questions, settings] = await Promise.all([
      Question.find({ testSuite: suiteId }),
      Settings.findOne()
    ]);

    const passingPct = settings?.passingPercentage ?? 50;
    let score        = 0;
    let totalMarks   = 0;
    let correctCount = 0;
    const categoryMap = {};

    const gradedAnswers = answers.map(({ questionId, selectedOptions }) => {
      const q = questions.find(q => q._id.toString() === questionId);
      if (!q) return { questionId, selectedOptions: selectedOptions || [], isCorrect: false };

      const marks = q.marks ?? 1;
      totalMarks += marks;

      const correctArr  = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      const selectedArr = Array.isArray(selectedOptions) ? selectedOptions : [];

      // Logic for Multi-Correct / Partial Credit
      const hits   = selectedArr.filter(i => correctArr.includes(i)).length;
      const wrongs = selectedArr.filter(i => !correctArr.includes(i)).length;
      
      // earnedFrac logic: (Hits - Wrongs) / Total Correct
      const earnedFrac = Math.max(0, (hits - wrongs) / correctArr.length);
      const isRight    = earnedFrac === 1;

      const earnedMarks = earnedFrac * marks;
      score += earnedMarks;
      if (isRight) correctCount++;

      // Map Categories for breakdown
      const cats = Array.isArray(q.category) ? q.category : [q.category || "Uncategorized"];
      cats.forEach(cat => {
        if (!categoryMap[cat]) categoryMap[cat] = { earned: 0, total: 0 };
        categoryMap[cat].total += marks;
        categoryMap[cat].earned += earnedMarks;
      });

      return {
        questionId,
        selectedOptions: selectedArr,
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
      percentage: data.total > 0 ? Math.round((data.earned / data.total) * 100) : 0,
    }));

    const pct    = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
    const passed = pct >= passingPct;

    const result = new Result({
      suiteId,
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
    const results = await Result.find({ suiteId: req.params.suiteId }).sort({ submittedAt: -1 });
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
      ];
    }

    const results = await Result.find(query).sort({ submittedAt: -1 });
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