const express = require("express");
const router = express.Router();
const Result = require("../models/Result");
const Question = require("../models/Question");

// POST /api/results  — candidate submits a completed test
router.post("/", async (req, res) => {
  try {
    const { suiteId, CandidateName, CandidateEmail, answers } = req.body;

    const questions = await Question.find({ testSuite: suiteId });

    let score        = 0;
    let totalMarks   = 0;
    let correctCount = 0;

    const gradedAnswers = answers.map(({ questionId, selectedOption }) => {
      const q = questions.find(q => q._id.toString() === questionId);
      if (!q) return { questionId, selectedOption, isCorrect: false, category: "" };
      const marks = q.marks ?? 1;
      totalMarks += marks;
      const isCorrect = selectedOption === q.correctAnswer;
      if (isCorrect) { score += marks; correctCount++; }
      return {
        questionId,
        selectedOption,
        isCorrect,
        category: q.category || "",
      };
    });

    // Build categoryResults array for ViewResults page
    const categoryMap = {};
    gradedAnswers.forEach(({ category, isCorrect }) => {
      if (!category) return;
      if (!categoryMap[category]) categoryMap[category] = { score: 0, total: 0 };
      categoryMap[category].total++;
      if (isCorrect) categoryMap[category].score++;
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
      // also populate legacy fields so ViewResults works
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

// GET /api/results/suite/:suiteId  — admin fetches all results for one suite
router.get("/suite/:suiteId", async (req, res) => {
  try {
    const results = await Result.find({ suiteId: req.params.suiteId })
      .sort({ submittedAt: -1 });
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching suite results" });
  }
});

// POST /api/results/add  — legacy route
router.post("/add", async (req, res) => {
  try {
    const { userName, userEmail, score, totalQuestions, categoryResults } = req.body;
    const newResult = new Result({
      userName, userEmail, score, totalQuestions, categoryResults,
    });
    await newResult.save();
    res.json({ message: "Result Saved Successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Saving Result" });
  }
});

// GET /api/results/my/:email  — candidate sees only their own
router.get("/my/:email", async (req, res) => {
  try {
    const results = await Result.find({ userEmail: req.params.email })
      .sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Results" });
  }
});

// GET /api/results/all  — admin sees all
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