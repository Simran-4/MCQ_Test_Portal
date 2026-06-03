// models/Question.js  (replace your existing Question model with this)
const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    // â”€â”€ NEW: every question now belongs to a test suite â”€â”€
    testSuite: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestSuite",
      required: true,
    },

    

    // â”€â”€ Your existing fields (keep as-is) â”€â”€
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      required: true,
      validate: (v) => v.length >= 2,
    },
    correctAnswer: {
      type: Number, // index of the correct option (0-based)
      required: true,
    },
    explanation: {
      type: String,
      default: "",
    },
    marks: {
      type: Number,
      default: 1,
    },
    language: {
      type: String,
      default: "en",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Question", questionSchema);