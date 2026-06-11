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
    questionType: {
      type: String,
      enum: ["mcq", "theory"],
      default: "mcq",
    },
    options: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          const update = typeof this.getUpdate === "function" ? this.getUpdate() : {};
          const questionType = this.questionType || this.get?.("questionType") || update.questionType || update.$set?.questionType;
          return questionType === "theory" || v.length >= 2;
        },
        message: "MCQ questions need at least 2 options",
      },
    },
    correctAnswer: {
      type: [Number],  // ✅ array of correct indices
      default: [],
    },
    categoryCorrectAnswers: {
      type: Map,
      of: [Number],
      default: {},
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
      type: [String],  // ✅ array of categories
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Question", questionSchema);
