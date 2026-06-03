const express = require("express");
const router = express.Router();
const Result = require("../models/Result");

// ADD RESULT
router.post("/add", async (req, res) => {
  try {
    const {
      userName,
      userEmail,
      score,
      totalQuestions,
      categoryResults,
    } = req.body;

    const newResult = new Result({
      userName,
      userEmail,
      score,
      totalQuestions,
      categoryResults,
    });

    await newResult.save();

    res.json({ message: "Result Saved Successfully" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Saving Result" });
  }
});

// ✅ GET RESULTS BY EMAIL — students see only their own
router.get("/my/:email", async (req, res) => {
  try {
    const results = await Result.find({
      userEmail: req.params.email
    }).sort({ createdAt: -1 });

    res.json(results);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Results" });
  }
});

// ✅ GET ALL RESULTS — for admin/teacher
router.get("/all", async (req, res) => {
  try {
    const results = await Result.find().sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error Fetching Results" });
  }
});

// DELETE ALL RESULTS
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