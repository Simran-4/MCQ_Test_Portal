const express = require("express");
const router = express.Router();
const ExamSettings = require("../models/ExamSettings");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");
const { hasAdminPermission } = require("../utils/adminPermissions");

const requireAdminOrSuperAdmin = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

const requireSettingsAccess = async (req, res, next) => {
  try {
    if (req.user.role === "superadmin") return next();
    const user = await User.findById(req.user.id).select("role adminPermissions");
    if (!hasAdminPermission(user, "canManageSettings")) {
      return res.status(403).json({ message: "Settings access denied" });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: "Permission check failed" });
  }
};

router.post("/save", authMiddleware, requireAdminOrSuperAdmin, requireSettingsAccess, async (req, res) => {
  try {
    const settings = await ExamSettings.findOneAndUpdate(
      {},
      req.body,
      { upsert: true, new: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: "Error saving settings" });
  }
});

router.get("/", async (req, res) => {
  try {
    let settings = await ExamSettings.findOne();

    // If no settings exist yet, create default ones
    if (!settings) {
      settings = await ExamSettings.create({
        totalQuestions: 20,
        examDuration: 30,
        passingPercentage: 50,   // NEW — default 50%
        questionsToServe: 10,    // NEW — default 10 random questions
      });
    }

    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: "Error fetching settings" });
  }
});

module.exports = router;
