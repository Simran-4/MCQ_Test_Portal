const express = require("express");
const router = express.Router();
const Question = require("../models/Question");

// POST /api/questions/add  (legacy — from old AddQuestion.jsx)
router.post("/add", async (req, res) => {
  try {
    const { question, options, correctAnswer, category, testSuiteId } = req.body;

    const filledOptions = options.filter(o => o.trim() !== "");
    const correctIndex  = filledOptions.indexOf(correctAnswer);
    if (correctIndex === -1)
      return res.status(400).json({ message: "Correct answer must match one of the options" });
    if (!testSuiteId)
      return res.status(400).json({ message: "Test suite is required" });

    const newQuestion = new Question({
      testSuite:     testSuiteId,
      questionText:  question.trim(),
      options:       filledOptions,
      correctAnswer: [correctIndex],   // ✅ store as array
      category:      Array.isArray(category) ? category : [category],
    });

    await newQuestion.save();
    res.status(201).json({ message: "Question Added Successfully" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Adding Question" });
  }
});

// PUT /api/questions/:id  ✅ NEW — edit existing question
router.put("/:id", async (req, res) => {
  try {
    const { questionText, options, correctAnswer, explanation, marks, category } = req.body;

    if (!questionText?.trim())
      return res.status(400).json({ message: "Question text is required" });

    const filledOptions = options.filter(o => o.trim() !== "");
    if (filledOptions.length < 2)
      return res.status(400).json({ message: "At least 2 options are required" });

    const correctArr = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
    if (correctArr.length === 0)
      return res.status(400).json({ message: "At least one correct answer is required" });

    // Validate all correct indices are within range
    const invalidIndex = correctArr.some(i => i < 0 || i >= filledOptions.length);
    if (invalidIndex)
      return res.status(400).json({ message: "Correct answer index out of range" });

    const updated = await Question.findByIdAndUpdate(
      req.params.id,
      {
        questionText:  questionText.trim(),
        options:       filledOptions,
        correctAnswer: correctArr,
        explanation:   explanation || "",
        marks:         marks || 1,
        category:      Array.isArray(category) ? category : (category ? [category] : []),
      },
      { new: true, runValidators: true }
    );

    if (!updated)
      return res.status(404).json({ message: "Question not found" });

    res.json(updated);

  } catch (err) {
    console.error("PUT /api/questions/:id error:", err);
    res.status(500).json({ message: "Failed to update question" });
  }
});

// DELETE /api/questions/:id  ✅ NEW — delete a single question
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Question.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ message: "Question not found" });
    res.json({ message: "Question deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/questions/:id error:", err);
    res.status(500).json({ message: "Failed to delete question" });
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