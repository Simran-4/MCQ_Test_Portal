const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema({
  questionId:      { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
  selectedOptions: { type: [Number], default: [] },
  isCorrect:       { type: Boolean, default: false },
  earnedMarks:     { type: Number, default: 0 },
  category:        { type: [String], default: [] },
}, { _id: false });

const categoryResultSchema = new mongoose.Schema({
  category:    { type: String },
  score:       { type: Number, default: 0 },
  total:       { type: Number, default: 0 },
  earnedMarks: { type: Number, default: 0 },
  percentage:  { type: Number, default: 0 },
}, { _id: false });

const resultSchema = new mongoose.Schema({
  suiteId:        { type: mongoose.Schema.Types.ObjectId, ref: "TestSuite" },
  CandidateName:  { type: String },
  CandidateEmail: { type: String },
  userName:       { type: String },
  userEmail:      { type: String },
  answers:        { type: [answerSchema], default: [] },
  score:          { type: Number, default: 0 },
  totalMarks:     { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  categoryResults:{ type: [categoryResultSchema], default: [] },
  submittedAt:    { type: Date, default: Date.now },

  // ── NEW FIELDS ────────────────────────────────────
  project:        { type: String, default: "General" },
  designation:    { type: String, default: "" },
  passed:         { type: Boolean, default: false },
  // ─────────────────────────────────────────────────

}, { timestamps: true });

module.exports = mongoose.model("Result", resultSchema);