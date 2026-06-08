const express = require("express");
const router  = express.Router();
const Result   = require("../models/Result");
const Question = require("../models/Question");

// ══════════════════════════════════════════════════════════════
// POST /api/results
// Full graded submission (used by the suite-based test engine)
// ══════════════════════════════════════════════════════════════
router.post("/", async (req, res) => {
  try {
    const {
      suiteId,
      CandidateName,
      CandidateEmail,
      answers,
      project,      // Feature 11 — NEW
      designation,  // Feature 11 — NEW
    } = req.body;

    const questions = await Question.find({ testSuite: suiteId });

    let score        = 0;
    let totalMarks   = 0;
    let correctCount = 0;

    const gradedAnswers = answers.map(({ questionId, selectedOptions }) => {
      const q = questions.find(q => q._id.toString() === questionId);
      if (!q) return { questionId, selectedOptions: selectedOptions || [], isCorrect: false, category: [] };

      const marks = q.marks ?? 1;
      totalMarks += marks;

      const correct  = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      const selected = Array.isArray(selectedOptions)
        ? selectedOptions
        : selectedOptions !== undefined ? [selectedOptions] : [];

      const isCorrect =
        correct.length === selected.length &&
        correct.every(c => selected.includes(c)) &&
        selected.every(s => correct.includes(s));

      if (isCorrect) { score += marks; correctCount++; }

      return {
        questionId,
        selectedOptions: selected,
        isCorrect,
        category: Array.isArray(q.category) ? q.category : (q.category ? [q.category] : []),
      };
    });

    // Build categoryResults
    const categoryMap = {};
    gradedAnswers.forEach(({ category, isCorrect }) => {
      const cats = Array.isArray(category) ? category : [category];
      cats.forEach(cat => {
        if (!cat) return;
        if (!categoryMap[cat]) categoryMap[cat] = { score: 0, total: 0 };
        categoryMap[cat].total++;
        if (isCorrect) categoryMap[cat].score++;
      });
    });

    const categoryResults = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      score:      data.score,
      total:      data.total,
      percentage: Math.round((data.score / data.total) * 100),
    }));

    // Feature 8: compute passed flag at save time
    const pct    = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
    const passed = pct >= 50; // default; overridden by settings if you want

    const result = new Result({
      suiteId,
      CandidateName,
      CandidateEmail,
      answers:        gradedAnswers,
      score,
      totalMarks,
      correctAnswers: correctCount,
      submittedAt:    new Date(),
      userName:       CandidateName,
      userEmail:      CandidateEmail,
      totalQuestions: questions.length,
      categoryResults,
      project:     project     || "General",  // Feature 11 — NEW
      designation: designation || "",         // Feature 11 — NEW
      passed,                                 // Feature 8  — NEW
    });

    await result.save();

    res.status(201).json({
      score,
      totalMarks,
      correctAnswers:  correctCount,
      totalQuestions:  questions.length,
      categoryResults,
      passed,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error submitting result" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/suite/:suiteId
// All results for a specific test suite
// ══════════════════════════════════════════════════════════════
router.get("/suite/:suiteId", async (req, res) => {
  try {
    const results = await Result.find({ suiteId: req.params.suiteId }).sort({ submittedAt: -1 });
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching suite results" });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/results/add  — legacy route used by old Test.jsx
// Now also accepts project + designation + totalMarks
// ══════════════════════════════════════════════════════════════
router.post("/add", async (req, res) => {
  try {
    const {
      userName,
      userEmail,
      score,
      totalMarks,
      totalQuestions,
      categoryResults,
      project,      // Feature 11 — NEW
      designation,  // Feature 11 — NEW
    } = req.body;

    // Feature 8: compute passed flag
    const tm     = totalMarks || totalQuestions || 0;
    const pct    = tm > 0 ? Math.round((score / tm) * 100) : 0;
    const passed = pct >= 50;

    const newResult = new Result({
      userName,
      userEmail,
      score,
      totalMarks:    totalMarks    || totalQuestions || 0,
      totalQuestions: totalQuestions || 0,
      categoryResults: categoryResults || [],
      project:     project     || "General",  // Feature 11 — NEW
      designation: designation || "",         // Feature 11 — NEW
      passed,                                 // Feature 8  — NEW
    });

    await newResult.save();
    res.json({ message: "Result Saved Successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Saving Result" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/my/:email
// All results for a specific candidate (by email)
// ══════════════════════════════════════════════════════════════
router.get("/my/:email", async (req, res) => {
  try {
    const results = await Result.find({ userEmail: req.params.email }).sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Results" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/all?search=&project=
// All results — with optional search and project filter
// Feature 11 + 12 — NEW query params
// ══════════════════════════════════════════════════════════════
router.get("/all", async (req, res) => {
  try {
    const { search, project } = req.query;

    const query = {};

    // Feature 11: filter by project
    if (project && project.trim() !== "") {
      query.project = project.trim();
    }

    // Feature 12: search across name + email
    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { userName:       regex },
        { userEmail:      regex },
        { CandidateName:  regex },
        { CandidateEmail: regex },
        { project:        regex },
        { designation:    regex },
      ];
    }

    const results = await Result.find(query).sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Results" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/projects
// Returns distinct project names — used to populate filter dropdown
// Feature 11 — NEW
// ══════════════════════════════════════════════════════════════
router.get("/projects", async (req, res) => {
  try {
    const projects = await Result.distinct("project");
    res.json(projects.filter(Boolean));
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Projects" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/by-project/:project
// All results for a specific project name
// Feature 11 — NEW
// ══════════════════════════════════════════════════════════════
router.get("/by-project/:project", async (req, res) => {
  try {
    const results = await Result.find({
      project: req.params.project,
    }).sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Results" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/results/delete-all  (utility — keep as-is)
// ══════════════════════════════════════════════════════════════
router.get("/delete-all", async (req, res) => {
  try {
    await Result.deleteMany({});
    res.json({ message: "All Results Deleted Successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Deleting Results" });
  }
});

module.exports = router;