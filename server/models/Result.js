const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema({
  questionId:     { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
  selectedOption: { type: Number, default: -1 },
  isCorrect:      { type: Boolean, default: false },
  category:       { type: String, default: "" },
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

  // legacy fields kept so old results don't break
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