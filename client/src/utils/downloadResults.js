// src/utils/downloadResults.js
// Usage: import { downloadResultsPDF } from "../utils/downloadResults";
// Call:  await downloadResultsPDF(suite, questions, results);
//
// Requires:  npm install jspdf jspdf-autotable
// In your client folder:  npm install jspdf jspdf-autotable

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const GREEN       = [45, 95, 63];    // #2D5F3F
const GREEN_DARK  = [26, 61, 40];    // #1A3D28
const GREEN_LIGHT = [232, 242, 236]; // #E8F2EC
const WHITE       = [255, 255, 255];
const GREY_TEXT   = [107, 107, 94];  // #6B6B5E

// ── Helpers ──────────────────────────────────────────────────
function pctColor(pct) {
  if (pct >= 75) return [22, 101, 52];  // green
  if (pct >= 50) return [146, 64, 14];  // amber
  return [185, 28, 28];                 // red
}

// ── Group duplicate categories and sum their stats ──────────
function groupCatMap(catMap) {
  const grouped = {};
  Object.entries(catMap).forEach(([cat, stats]) => {
    // Strip trailing comma-separated duplicates e.g. "Neurotic Tendency,Self Sufficiency"
    // Each key is already a single category in our new backend, but handle legacy too
    const keys = cat.includes(",") ? cat.split(",").map(s => s.trim()) : [cat];
    keys.forEach(key => {
      if (!grouped[key]) grouped[key] = { total: 0, correct: 0, marks: 0, earned: 0 };
      grouped[key].total   += stats.total   / keys.length;
      grouped[key].correct += stats.correct / keys.length;
      grouped[key].marks   += stats.marks   / keys.length;
      grouped[key].earned  += stats.earned  / keys.length;
    });
  });
  // Round everything
  Object.values(grouped).forEach(s => {
    s.total   = Math.round(s.total);
    s.correct = Math.round(s.correct);
    s.marks   = Math.round(s.marks);
    s.earned  = Math.round(s.earned * 10) / 10;
  });
  return grouped;
}

function drawHeader(doc, suite, pageWidth) {
  doc.setFillColor(...GREEN_DARK);
  doc.rect(0, 0, pageWidth, 22, "F");

  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Snehalaya MCQ Portal", 14, 9);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  // Use plain ASCII characters to avoid encoding issues
  doc.text(`Results Report - ${suite.name}`, 14, 16);

  const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  doc.setFontSize(8);
  doc.text(dateStr, pageWidth - 14, 16, { align: "right" });
}

function drawFooter(doc, pageNum, totalPages, pageWidth, pageHeight) {
  doc.setFontSize(7);
  doc.setTextColor(...GREY_TEXT);
  doc.setFont("helvetica", "normal");
  doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: "center" });
  doc.setDrawColor(200, 200, 200);
  doc.line(14, pageHeight - 10, pageWidth - 14, pageHeight - 10);
}

// ── Main export ───────────────────────────────────────────────
export async function downloadResultsPDF(suite, questions, results) {
  const doc        = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ── Build per-result stats ──
  const statsPerResult = results.map(r => {
    const catMap = {};

    // Initialise from questions
    questions.forEach(q => {
      const cats = Array.isArray(q.category)
        ? q.category
        : (q.category ? q.category.split(",").map(s => s.trim()) : ["Uncategorized"]);
      cats.forEach(cat => {
        if (!catMap[cat]) catMap[cat] = { total: 0, correct: 0, marks: 0, earned: 0 };
        catMap[cat].total++;
        catMap[cat].marks += q.marks ?? 1;
      });
    });

    // Fill in answers
    (r.answers || []).forEach(ans => {
      const q = questions.find(
        q => q._id === ans.questionId || q._id?.toString() === ans.questionId?.toString()
      );
      if (!q) return;
      const cats = Array.isArray(q.category)
        ? q.category
        : (q.category ? q.category.split(",").map(s => s.trim()) : ["Uncategorized"]);
      const earnedPerCat = (ans.earnedMarks ?? (ans.isCorrect ? (q.marks ?? 1) : 0)) / cats.length;
      cats.forEach(cat => {
        if (!catMap[cat]) catMap[cat] = { total: 0, correct: 0, marks: 0, earned: 0 };
        if (ans.isCorrect) catMap[cat].correct++;
        catMap[cat].earned += earnedPerCat;
      });
    });

    const pct = r.totalMarks > 0 ? Math.round((r.score / r.totalMarks) * 100) : 0;
    return { ...r, catMap, pct };
  });

  // ── All unique categories across the suite (grouped) ──
  const allCatsRaw = [...new Set(
    questions.flatMap(q =>
      Array.isArray(q.category)
        ? q.category
        : (q.category ? q.category.split(",").map(s => s.trim()) : ["Uncategorized"])
    )
  )];

  // ══════════════════════════════════════════════════════════
  //  PAGE 1 -- SUMMARY SHEET
  // ══════════════════════════════════════════════════════════
  drawHeader(doc, suite, pageWidth);

  let y = 30;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREEN_DARK);
  doc.text("Summary - All Candidates", 14, y);

  y += 7;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY_TEXT);
  const totalMarksAll = questions.reduce((a, q) => a + (q.marks ?? 1), 0);
  doc.text(
    `${results.length} Candidate${results.length !== 1 ? "s" : ""}   |   ${questions.length} question${questions.length !== 1 ? "s" : ""}   |   ${totalMarksAll} total marks`,
    14, y
  );
  y += 6;

  // Summary table: truncate long category names for columns
  const summaryHead = [[
    "#", "Candidate Name", "Email", "Score", "%", "Result",
    ...allCatsRaw.map(c => c.length > 14 ? c.slice(0, 13) + "..." : c),
  ]];

  const summaryBody = statsPerResult.map((r, i) => {
    const grouped = groupCatMap(r.catMap);
    const catCols = allCatsRaw.map(cat => {
      const s = grouped[cat];
      if (!s) return "-";
      const p = s.marks > 0 ? Math.round((s.earned / s.marks) * 100) : 0;
      return `${s.correct}/${s.total} (${p}%)`;
    });
    return [
      i + 1,
      r.CandidateName || "-",
      r.CandidateEmail || "-",
      `${r.score ?? 0}/${r.totalMarks ?? 0}`,
      `${r.pct}%`,
      r.pct >= 50 ? "Pass" : "Fail",
      ...catCols,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: summaryHead,
    body: summaryBody,
    margin: { left: 14, right: 14 },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      font: "helvetica",
      textColor: [30, 30, 30],
      lineColor: [220, 220, 215],
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: GREEN_DARK,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
    },
    alternateRowStyles: { fillColor: [248, 247, 244] },
    columnStyles: {
      0: { cellWidth: 7,  halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: 38 },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      5: { cellWidth: 14, halign: "center", fontStyle: "bold" },
    },
    didParseCell(data) {
      if (data.section === "body") {
        if (data.column.index === 4) {
          data.cell.styles.textColor = pctColor(parseInt(data.cell.text[0]));
        }
        if (data.column.index === 5) {
          data.cell.styles.textColor = data.cell.text[0] === "Pass" ? [22, 101, 52] : [185, 28, 28];
        }
        if (data.column.index >= 6) {
          const m = data.cell.text[0].match(/\((\d+)%\)/);
          if (m) data.cell.styles.textColor = pctColor(parseInt(m[1]));
        }
      }
    },
    didDrawPage() {
      const pg = doc.internal.getCurrentPageInfo().pageNumber;
      drawFooter(doc, pg, "?", pageWidth, pageHeight);
    },
  });

  // ══════════════════════════════════════════════════════════
  //  PAGE(S) 2+ -- DETAIL SHEET (one section per Candidate)
  // ══════════════════════════════════════════════════════════
  doc.addPage();
  drawHeader(doc, suite, pageWidth);

  y = 30;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREEN_DARK);
  doc.text("Detailed Results - Per Candidate", 14, y);
  y += 10;

  statsPerResult.forEach((r, idx) => {
    if (y > pageHeight - 70) {
      doc.addPage();
      drawHeader(doc, suite, pageWidth);
      y = 30;
    }

    // Candidate header bar
    doc.setFillColor(...GREEN_LIGHT);
    doc.roundedRect(14, y, pageWidth - 28, 10, 2, 2, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREEN_DARK);
    doc.text(`${idx + 1}. ${r.CandidateName || "Unknown"}`, 18, y + 6.5);

    // Score on right -- plain ASCII only
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...pctColor(r.pct));
    doc.text(
      `${r.pct}%  (${r.score}/${r.totalMarks} marks)  --  ${r.pct >= 50 ? "PASS" : "FAIL"}`,
      pageWidth - 18, y + 6.5, { align: "right" }
    );
    y += 14;

    // Group this candidate's catMap
    const grouped = groupCatMap(r.catMap);

    // Category breakdown table -- grouped, no duplicates
    const catRows = allCatsRaw.map(cat => {
      const s = grouped[cat] || { correct: 0, total: 0, marks: 0, earned: 0 };
      const p = s.marks > 0 ? Math.round((s.earned / s.marks) * 100) : 0;
      return [cat, `${s.correct}/${s.total}`, `${s.earned}/${s.marks}`, `${p}%`];
    });

    autoTable(doc, {
      startY: y,
      head: [["Category", "Correct / Total", "Marks Earned", "%"]],
      body: catRows,
      margin: { left: 14, right: 14 },
      tableWidth: (pageWidth - 28) * 0.65,
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5,
        lineColor: [220, 220, 215],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: GREEN,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: [248, 247, 244] },
      columnStyles: {
        1: { halign: "center" },
        2: { halign: "center" },
        3: { halign: "center", fontStyle: "bold" },
      },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 3) {
          data.cell.styles.textColor = pctColor(parseInt(data.cell.text[0]));
        }
      },
      didDrawPage() {
        drawHeader(doc, suite, pageWidth);
      },
    });

    y = doc.lastAutoTable.finalY + 12;
  });

  // ── Fix footer page numbers now we know total pages ──
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages, pageWidth, pageHeight);
  }

  // ── Save ──
  const safeName = suite.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  doc.save(`results_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}