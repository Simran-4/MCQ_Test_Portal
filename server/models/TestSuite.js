const mongoose = require("mongoose");

const testSuiteSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "scheduled"],
      default: "draft",
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,  // in minutes
      default: 30,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TestSuite", testSuiteSchema);