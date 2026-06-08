const express  = require("express");
const multer   = require("multer");
const XLSX     = require("xlsx");
const Question = require("../models/Question");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── UPDATE QUESTION ───────────────────────────────────────────
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const updated = await Question.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Question not found" });
    res.json(updated);
  } catch (err) {
    console.error("Update Question Error:", err);
    res.status(500).json({ message: "Failed to update question" });
  }
});

// ── DELETE QUESTION ───────────────────────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete" });
  }
});

// ── BULK IMPORT FROM EXCEL ────────────────────────────────────
router.post(
  "/test-suites/:suiteId/import-excel",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded." });

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet    = workbook.Sheets[workbook.SheetNames[0]];
      const rows     = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0)
        return res.status(400).json({ message: "Excel file is empty or has no data rows." });

      const questions = [];
      const errors    = [];

      rows.forEach((row, i) => {
        const rowNum = i + 2;

        const questionText = String(row["questionText"] || row["Question"] || row["question"] || "").trim();
        if (!questionText) { errors.push(`Row ${rowNum}: missing questionText`); return; }

        const options = [
          String(row["option1"] || row["Option1"] || row["A"] || "").trim(),
          String(row["option2"] || row["Option2"] || row["B"] || "").trim(),
          String(row["option3"] || row["Option3"] || row["C"] || "").trim(),
          String(row["option4"] || row["Option4"] || row["D"] || "").trim(),
        ].filter(Boolean);

        if (options.length < 2) { errors.push(`Row ${rowNum}: need at least 2 options`); return; }

        const rawCorrect = String(
          row["correctAnswers"] || row["CorrectAnswers"] || row["correct"] || row["answer"] || "0"
        ).trim();
        const correctAnswer = rawCorrect
          .split(",")
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n));

        if (correctAnswer.length === 0) { errors.push(`Row ${rowNum}: invalid correctAnswers`); return; }

        const explanation = String(row["explanation"] || row["Explanation"] || "").trim();
        const marks       = parseInt(row["marks"] || row["Marks"] || 1, 10) || 1;
        const language    = String(row["language"] || row["Language"] || "en").trim();
        const rawCat      = String(row["category"] || row["Category"] || "General").trim();
        const category    = rawCat.split(",").map(s => s.trim()).filter(Boolean);

        questions.push({ testSuite: req.params.suiteId, questionText, options, correctAnswer, explanation, marks, language, category });
      });

      if (questions.length === 0)
        return res.status(400).json({ message: "No valid questions found.", errors });

      const inserted = await Question.insertMany(questions);
      res.status(201).json({
        message: `Successfully imported ${inserted.length} question(s).`,
        imported: inserted.length,
        skipped: errors.length,
        errors,
      });

    } catch (err) {
      console.error("Excel import error:", err);
      res.status(500).json({ message: "Failed to process Excel file.", error: err.message });
    }
  }
);

module.exports = router;