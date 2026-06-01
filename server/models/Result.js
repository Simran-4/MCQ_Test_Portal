
const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema({

  userName: {
    type: String,
    required: true,
  },

  userEmail: {
    type: String,
    required: true,
  },

  score: {
    type: Number,
    required: true,
  },

  totalQuestions: {
    type: Number,
    required: true,
  },

  categoryResults: [
    {
      category: String,
      score: Number,
      total: Number,
      percentage: Number,
    },
  ],

  createdAt: {
    type: Date,
    default: Date.now,
  },

});

module.exports =
  mongoose.model(
    "Result",
    resultSchema
  );

