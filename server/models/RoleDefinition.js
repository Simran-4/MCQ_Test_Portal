const mongoose = require("mongoose");

const roleDefinitionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    baseRole: {
      type: String,
      enum: ["candidate", "admin"],
      default: "candidate",
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RoleDefinition", roleDefinitionSchema);
