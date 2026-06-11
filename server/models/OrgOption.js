const mongoose = require("mongoose");

const orgProjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    departments: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const orgOptionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "default",
      unique: true,
    },
    projects: {
      type: [orgProjectSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OrgOption", orgOptionSchema);
