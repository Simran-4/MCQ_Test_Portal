const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema({
  questionId:      { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
  selectedOptions: { type: [Number], default: [] },  // ✅ array
  isCorrect:       { type: Boolean, default: false },
  category:        { type: [String], default: [] },   // ✅ array
}, { _id: false });

const resultSchema = new mongoose.Schema({
  suiteId:        { type: mongoose.Schema.Types.ObjectId, ref: "TestSuite" },
  CandidateName:  { type: String, default: "" },
  CandidateEmail: { type: String, default: "" },
  answers:        [answerSchema],
  score:          { type: Number, default: 0 },
  totalMarks:     { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  submittedAt:    { type: Date, default: Date.now },
  userName:       { type: String, default: "" },
  userEmail:      { type: String, default: "" },
  totalQuestions: { type: Number, default: 0 },
  categoryResults: [
    {
      category:   String,
      score:      Number,
      total:      Number,
      percentage: Number,
    },
  ],
}, { timestamps: true });

module.exports = mongoose.models.Result || mongoose.model("Result", resultSchema);