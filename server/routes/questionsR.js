const express = require("express");
const router = express.Router();

const Question = require("../models/Question");


// ADD QUESTION
router.post("/add", async (req, res) => {

  try {

    const {
      question,
      options,
      correctAnswer,
      category,
    } = req.body;

    const newQuestion = new Question({
      question,
      options,
      correctAnswer,
      category,
    });

    await newQuestion.save();

    res.status(201).json({
      message: "Question Added Successfully",
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Error Adding Question",
    });
  }
});


// GET ALL QUESTIONS
router.get("/all", async (req, res) => {

  try {

    const questions = await Question.find();

    res.json(questions);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Error Fetching Questions",
    });
  }
});


// DELETE ALL QUESTIONS
router.get("/delete-all", async (req, res) => {

  try {

    await Question.deleteMany({});

    res.json({
      message: "All Questions Deleted Successfully",
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Error Deleting Questions",
    });
  }
});

module.exports = router;