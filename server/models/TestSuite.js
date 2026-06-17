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
      enum: ["draft", "active", "scheduled", "inactive"],
      default: "draft",
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 30,
    },
    passingPercentage: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },

    // ── Feature 5 & 15: Random question pool ─────────────────
    questionsToServe: {
      type: Number,
      default: null, // null = serve all questions
    },
    questionSelectionMode: {
      type: String,
      enum: ["all", "random", "selected"],
      default: "all",
    },
    selectedQuestionIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
    }],

    // ── Feature 9: Test availability window ──────────────────
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },

    // ── Feature 13: Assign to specific users ─────────────────
    isPublic: {
      type: Boolean,
      default: true,
    },
    assignedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    assignedUsersMeta: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      assignedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TestSuite", testSuiteSchema);
