const mongoose = require("mongoose");

const examSettingsSchema = new mongoose.Schema({
  // Feature 8: Global Passing Threshold
  passingPercentage: {
    type: Number,
    default: 50,
  },
  
  totalQuestions: {
    type: Number,
    default: 20,
  },

  examDuration: {
    type: Number,
    default: 30,
  },

  aptitudeCount: {
    type: Number,
    default: 5,
  },

  reasoningCount: {
    type: Number,
    default: 5,
  },

  technicalCount: {
    type: Number,
    default: 5,
  },

  verbalCount: {
    type: Number,
    default: 5,
  },

  negativeMarking: {
    type: Number,
    default: 0,
  },

  shuffleQuestions: {
    type: Boolean,
    default: true,
  },
});

module.exports = mongoose.model("ExamSettings", examSettingsSchema);