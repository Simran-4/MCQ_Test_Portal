const express = require("express");
const router = express.Router();
const Result = require("../models/Result");
const Question = require("../models/Question");

// POST /api/results
router.post("/", async (req, res) => {
  try {
    const { suiteId, CandidateName, CandidateEmail, answers } = req.body;

    const questions = await Question.find({ testSuite: suiteId });

    let score        = 0;
    let totalMarks   = 0;
    let correctCount = 0;

    const gradedAnswers = answers.map(({ questionId, selectedOptions }) => {
      const q = questions.find(q => q._id.toString() === questionId);
      if (!q) return { questionId, selectedOptions: selectedOptions || [], isCorrect: false, earnedMarks: 0, category: [] };

      const marks    = q.marks ?? 1;
      totalMarks    += marks;

      const correct  = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      const selected = Array.isArray(selectedOptions) ? selectedOptions : (selectedOptions !== undefined ? [selectedOptions] : []);

      // ── Partial marking ──
      // +1 for each correct option selected, -1 for each wrong option selected
      // Divided by total correct options, clamped to 0 minimum
      const totalCorrect = correct.length;
      const hits         = selected.filter(s => correct.includes(s)).length;
      const wrongs       = selected.filter(s => !correct.includes(s)).length;
      const earnedFrac   = Math.max(0, (hits - wrongs) / totalCorrect);
      const earnedMarks  = Math.round(earnedFrac * marks * 100) / 100;
      const isCorrect    = earnedFrac === 1;

      score += earnedMarks;
      if (isCorrect) correctCount++;

      return {
        questionId,
        selectedOptions: selected,
        isCorrect,
        earnedMarks,
        category: Array.isArray(q.category) ? q.category : (q.category ? [q.category] : []),
      };
    });

    // ── Build categoryResults with partial marks ──
    const categoryMap = {};
    gradedAnswers.forEach(({ category, isCorrect, earnedMarks }) => {
      const cats = Array.isArray(category) ? category : [category];
      cats.forEach(cat => {
        if (!cat) return;
        if (!categoryMap[cat]) categoryMap[cat] = { score: 0, total: 0, earnedMarks: 0 };
        categoryMap[cat].total++;
        categoryMap[cat].earnedMarks += earnedMarks;
        if (isCorrect) categoryMap[cat].score++;
      });
    });

    const categoryResults = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      score:       data.score,
      total:       data.total,
      earnedMarks: Math.round(data.earnedMarks * 100) / 100,
      percentage:  Math.round((data.earnedMarks / data.total) * 100),
    }));

    // Round final score to 2dp
    score = Math.round(score * 100) / 100;

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
    });

    await result.save();

    res.status(201).json({
      score,
      totalMarks,
      correctAnswers:  correctCount,
      totalQuestions:  questions.length,
      categoryResults,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error submitting result" });
  }
});

// GET /api/results/suite/:suiteId
router.get("/suite/:suiteId", async (req, res) => {
  try {
    const results = await Result.find({ suiteId: req.params.suiteId }).sort({ submittedAt: -1 });
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching suite results" });
  }
});

// POST /api/results/add — legacy
router.post("/add", async (req, res) => {
  try {
    const { userName, userEmail, score, totalQuestions, categoryResults } = req.body;
    const newResult = new Result({ userName, userEmail, score, totalQuestions, categoryResults });
    await newResult.save();
    res.json({ message: "Result Saved Successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Saving Result" });
  }
});

// GET /api/results/my/:email
router.get("/my/:email", async (req, res) => {
  try {
    const results = await Result.find({ userEmail: req.params.email }).sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Results" });
  }
});

// GET /api/results/all
router.get("/all", async (req, res) => {
  try {
    const results = await Result.find().sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Results" });
  }
});

// GET /api/results/delete-all
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