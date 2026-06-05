// server/routes/questionsRoutes.js
const express  = require("express");
const multer   = require("multer");
const XLSX     = require("xlsx");
const pdfParse = require("pdf-parse");
const Question = require("../models/Question");

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────
//  EXISTING ROUTES (keep whatever you already had here)
// ─────────────────────────────────────────────────────────────

// GET all questions for a suite
router.get("/test-suites/:suiteId/questions", async (req, res) => {
  try {
    const questions = await Question.find({ testSuite: req.params.suiteId });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch questions" });
  }
});

// POST single question
router.post("/test-suites/:suiteId/questions", async (req, res) => {
  try {
    const question = new Question({ testSuite: req.params.suiteId, ...req.body });
    await question.save();
    res.status(201).json(question);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE question
router.delete("/questions/:id", async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete" });
  }
});

// ─────────────────────────────────────────────────────────────
//  BULK IMPORT FROM EXCEL
//  POST /api/test-suites/:suiteId/import-excel
//
//  Expected Excel columns (row 1 = headers):
//  questionText | option1 | option2 | option3 | option4 |
//  correctAnswers (comma-separated 0-based indices e.g. "0" or "0,2") |
//  explanation | marks | category | language
// ─────────────────────────────────────────────────────────────
router.post(
  "/test-suites/:suiteId/import-excel",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded." });

      const workbook  = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet     = workbook.Sheets[workbook.SheetNames[0]];
      const rows      = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0)
        return res.status(400).json({ message: "Excel file is empty or has no data rows." });

      const questions = [];
      const errors    = [];

      rows.forEach((row, i) => {
        const rowNum = i + 2; // 1-indexed, row 1 = header

        // ── question text ──
        const questionText = String(row["questionText"] || row["Question"] || row["question"] || "").trim();
        if (!questionText) { errors.push(`Row ${rowNum}: missing questionText`); return; }

        // ── options ──
        const options = [
          String(row["option1"] || row["Option1"] || row["A"] || "").trim(),
          String(row["option2"] || row["Option2"] || row["B"] || "").trim(),
          String(row["option3"] || row["Option3"] || row["C"] || "").trim(),
          String(row["option4"] || row["Option4"] || row["D"] || "").trim(),
        ].filter(Boolean);

        if (options.length < 2) { errors.push(`Row ${rowNum}: need at least 2 options`); return; }

        // ── correct answers ── (0-based indices, comma-separated)
        const rawCorrect = String(
          row["correctAnswers"] || row["CorrectAnswers"] || row["correct"] || row["answer"] || "0"
        ).trim();
        const correctAnswer = rawCorrect
          .split(",")
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n));

        if (correctAnswer.length === 0) { errors.push(`Row ${rowNum}: invalid correctAnswers`); return; }

        // ── optional fields ──
        const explanation = String(row["explanation"] || row["Explanation"] || "").trim();
        const marks       = parseInt(row["marks"] || row["Marks"] || 1, 10) || 1;
        const language    = String(row["language"] || row["Language"] || "en").trim();

        // category can be comma-separated string → array
        const rawCat  = String(row["category"] || row["Category"] || "General").trim();
        const category = rawCat.split(",").map(s => s.trim()).filter(Boolean);

        questions.push({
          testSuite: req.params.suiteId,
          questionText,
          options,
          correctAnswer,
          explanation,
          marks,
          language,
          category,
        });
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

// ─────────────────────────────────────────────────────────────
//  BULK IMPORT FROM PDF
//  POST /api/test-suites/:suiteId/import-pdf
//
//  Expected PDF format (one question per block):
//  Q1. Question text here?
//  A) Option one
//  B) Option two
//  C) Option three
//  D) Option four
//  Answer: A
//  Category: Confidence
//  Marks: 2
//  (blank line between questions)
// ─────────────────────────────────────────────────────────────
router.post(
  "/test-suites/:suiteId/import-pdf",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded." });

      const data = await pdfParse(req.file.buffer);
      const text = data.text;

      // ── Split into question blocks by blank lines or Q\d+\. pattern ──
      const blocks = text
        .split(/\n{2,}/)
        .map(b => b.trim())
        .filter(b => b.length > 10);

      const questions = [];
      const errors    = [];

      blocks.forEach((block, i) => {
        const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) return;

        // ── Question text: first line, strip leading Q1. / 1. / Q1) ──
        let questionText = lines[0].replace(/^(Q\d+[\.\)]|\d+[\.\)])\s*/i, "").trim();
        if (!questionText) return;

        // ── Options: lines starting with A) B) C) D) or A. B. C. D. ──
        const optionRegex = /^([A-Da-d][\.\):])\s+(.+)/;
        const optionLines = lines.filter(l => optionRegex.test(l));
        const options     = optionLines.map(l => l.replace(optionRegex, "$2").trim());

        if (options.length < 2) {
          errors.push(`Block ${i + 1} ("${questionText.slice(0, 30)}…"): not enough options`);
          return;
        }

        // ── Answer line: "Answer: A" or "Ans: B,C" ──
        const answerLine = lines.find(l => /^(answer|ans|correct)[\s:]+/i.test(l)) || "";
        const answerLetters = answerLine
          .replace(/^(answer|ans|correct)[\s:]*/i, "")
          .split(/[,\s]+/)
          .map(s => s.trim().toUpperCase())
          .filter(Boolean);

        const letterToIndex = { A: 0, B: 1, C: 2, D: 3 };
        const correctAnswer = answerLetters
          .map(l => letterToIndex[l])
          .filter(n => n !== undefined);

        if (correctAnswer.length === 0) {
          errors.push(`Block ${i + 1}: could not parse answer`);
          return;
        }

        // ── Category ──
        const catLine  = lines.find(l => /^category[\s:]+/i.test(l)) || "";
        const rawCat   = catLine.replace(/^category[\s:]*/i, "").trim() || "General";
        const category = rawCat.split(",").map(s => s.trim()).filter(Boolean);

        // ── Marks ──
        const marksLine = lines.find(l => /^marks?[\s:]+/i.test(l)) || "";
        const marks     = parseInt(marksLine.replace(/^marks?[\s:]*/i, "").trim(), 10) || 1;

        // ── Explanation ──
        const expLine     = lines.find(l => /^(explanation|exp)[\s:]+/i.test(l)) || "";
        const explanation = expLine.replace(/^(explanation|exp)[\s:]*/i, "").trim();

        questions.push({
          testSuite: req.params.suiteId,
          questionText,
          options,
          correctAnswer,
          explanation,
          marks,
          language: "en",
          category,
        });
      });

      if (questions.length === 0)
        return res.status(400).json({
          message: "No valid questions parsed from PDF. Check the format.",
          errors,
        });

      const inserted = await Question.insertMany(questions);
      res.status(201).json({
        message: `Successfully imported ${inserted.length} question(s) from PDF.`,
        imported: inserted.length,
        skipped: errors.length,
        errors,
      });

    } catch (err) {
      console.error("PDF import error:", err);
      res.status(500).json({ message: "Failed to process PDF file.", error: err.message });
    }
  }
);

module.exports = router;