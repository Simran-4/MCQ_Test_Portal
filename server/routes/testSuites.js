const express = require("express");
const router = express.Router();
const TestSuite = require("../models/TestSuite");
const Question = require("../models/Question");
const authMiddleware = require("../middleware/authMiddleware");
// ✅ FIX: Match the exact filename in your models folder
const ExamSettings = require("../models/ExamSettings");

// ── GET ALL SUITES ────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    // Fetches suites and calculates question counts for the Dashboard stats
    const suites = await TestSuite.find().sort({ createdAt: -1 });
    const suitesWithCount = await Promise.all(
      suites.map(async (suite) => {
        const count = await Question.countDocuments({ testSuite: suite._id });
        return { ...suite.toObject(), questionCount: count };
      })
    );
    res.json(suitesWithCount);
  } catch (err) {
    res.status(500).json({ message: "Error fetching suites" });
  }
});

// ── CREATE NEW SUITE ──────────────────────────────────────────
// Added authMiddleware to ensure only logged-in admins can create
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, description, status } = req.body;
    
    const newSuite = new TestSuite({
      name,
      description,
      status: status || "draft",
    });

    const savedSuite = await newSuite.save();
    res.status(201).json(savedSuite);
  } catch (err) {
    console.error("Create Suite Error:", err);
    res.status(500).json({ message: "Error creating test suite" });
  }
});

// ── UPDATE SUITE ──────────────────────────────────────────────
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const updatedSuite = await TestSuite.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    res.json(updatedSuite);
  } catch (err) {
    res.status(500).json({ message: "Error updating suite" });
  }
});

// ── DELETE SUITE ──────────────────────────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    // Delete the suite AND all questions associated with it
    await Question.deleteMany({ testSuite: req.params.id });
    await TestSuite.findByIdAndDelete(req.params.id);
    res.json({ message: "Suite and associated questions deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting suite" });
  }
});

// ── GET SINGLE SUITE DETAILS ──────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const suite = await TestSuite.findById(req.params.id);
    if (!suite) return res.status(404).json({ message: "Suite not found" });
    res.json(suite);
  } catch (err) {
    res.status(500).json({ message: "Error fetching suite details" });
  }
});

module.exports = router;