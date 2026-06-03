const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    testSuite: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestSuite",
      required: true,
    },
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
      type: Number,
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
    category: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Question", questionSchema);