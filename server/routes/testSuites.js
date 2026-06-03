// routes/testSuites.js  â”€â”€ add this new file to your backend
const express = require("express");
const router = express.Router();
const TestSuite = require("../models/TestSuite");
const Question = require("../models/Question");

// â”€â”€ Middleware: protect all routes (reuse your existing auth middleware) â”€â”€
// const authMiddleware = require("../middleware/auth");
// router.use(authMiddleware);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/test-suites
// Returns all test suites with question counts
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/", async (req, res) => {
  try {
    const suites = await TestSuite.find().sort({ createdAt: -1 });

    // Attach question count to each suite
    const suitesWithCount = await Promise.all(
      suites.map(async (suite) => {
        const count = await Question.countDocuments({ testSuite: suite._id });
        return { ...suite.toObject(), questionCount: count };
      })
    );

    res.json(suitesWithCount);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/test-suites
// Create a new test suite
// Body: { name, description?, status? }
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/", async (req, res) => {
  try {
    const { name, description, status, scheduledAt } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Test suite name is required" });
    }

    const suite = new TestSuite({ name, description, status, scheduledAt });
    await suite.save();

    res.status(201).json(suite);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// GET /api/test-suites/active
// Returns only active suites for Candidates
router.get("/active", async (req, res) => {
  try {
    const suites = await TestSuite.find({ status: "active" }).sort({ createdAt: -1 });

    const suitesWithCount = await Promise.all(
      suites.map(async (suite) => {
        const count = await Question.countDocuments({ testSuite: suite._id });
        return { ...suite.toObject(), questionCount: count };
      })
    );

    res.json(suitesWithCount);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/test-suites/:id
// Get a single test suite by ID
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/:id", async (req, res) => {
  try {
    const suite = await TestSuite.findById(req.params.id);
    if (!suite) return res.status(404).json({ message: "Test suite not found" });

    const questionCount = await Question.countDocuments({ testSuite: suite._id });
    res.json({ ...suite.toObject(), questionCount });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PUT /api/test-suites/:id
// Update a test suite name / status
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.put("/:id", async (req, res) => {
  try {
    const suite = await TestSuite.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!suite) return res.status(404).json({ message: "Test suite not found" });
    res.json(suite);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DELETE /api/test-suites/:id
// Delete a test suite AND all its questions
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete("/:id", async (req, res) => {
  try {
    const suite = await TestSuite.findByIdAndDelete(req.params.id);
    if (!suite) return res.status(404).json({ message: "Test suite not found" });

    // Also delete all questions belonging to this suite
    await Question.deleteMany({ testSuite: req.params.id });

    res.json({ message: "Test suite and its questions deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/test-suites/:id/questions
// Get all questions for a specific test suite
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/:id/questions", async (req, res) => {
  try {
    const questions = await Question.find({ testSuite: req.params.id }).sort({
      createdAt: 1,
    });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/test-suites/:id/questions
// Add a question to a specific test suite
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/:id/questions", async (req, res) => {
  try {
    const suite = await TestSuite.findById(req.params.id);
    if (!suite) return res.status(404).json({ message: "Test suite not found" });

    const question = new Question({
      ...req.body,
      testSuite: req.params.id,
    });
    await question.save();

    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;