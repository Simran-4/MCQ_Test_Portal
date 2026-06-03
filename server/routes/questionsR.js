const express = require("express");
const router = express.Router();
const Question = require("../models/Question");

// POST /api/questions/add
router.post("/add", async (req, res) => {
  try {
    const { question, options, correctAnswer, category, testSuiteId } = req.body;

    const filledOptions = options.filter(o => o.trim() !== "");

    const correctIndex = filledOptions.indexOf(correctAnswer);
    if (correctIndex === -1) {
      return res.status(400).json({ message: "Correct answer must match one of the options" });
    }

    if (!testSuiteId) {
      return res.status(400).json({ message: "Test suite is required" });
    }

    const newQuestion = new Question({
      testSuite:     testSuiteId,
      questionText:  question.trim(),
      options:       filledOptions,
      correctAnswer: correctIndex,
      category,
    });

    await newQuestion.save();
    res.status(201).json({ message: "Question Added Successfully" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Adding Question" });
  }
});

// GET /api/questions/all
router.get("/all", async (req, res) => {
  try {
    const questions = await Question.find();
    res.json(questions);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Questions" });
  }
});

// GET /api/questions/delete-all
router.get("/delete-all", async (req, res) => {
  try {
    await Question.deleteMany({});
    res.json({ message: "All Questions Deleted Successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Deleting Questions" });
  }
});

module.exports = router;