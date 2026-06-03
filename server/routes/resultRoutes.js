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
      if (!q) return { questionId, selectedOptions: selectedOptions || [], isCorrect: false, category: [] };

      const marks = q.marks ?? 1;
      totalMarks += marks;

      // ✅ Multi-answer grading: selected must exactly match correctAnswer array
      const correct = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      const selected = Array.isArray(selectedOptions) ? selectedOptions : (selectedOptions !== undefined ? [selectedOptions] : []);
      const isCorrect = correct.length === selected.length &&
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