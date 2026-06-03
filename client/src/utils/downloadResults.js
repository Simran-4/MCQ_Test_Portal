// src/utils/downloadResults.js
// Usage: import { downloadResultsPDF } from "../utils/downloadResults";
// Call:  await downloadResultsPDF(suite, questions, results);
//
// Requires:  npm install jspdf jspdf-autotable
// In your client folder:  npm install jspdf jspdf-autotable

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const GREEN      = [45, 95, 63];   // #2D5F3F
const GREEN_DARK = [26, 61, 40];   // #1A3D28
const GREEN_LIGHT= [232, 242, 236];// #E8F2EC
const GREY_BG    = [238, 233, 224];// #EEE9E0
const WHITE      = [255, 255, 255];
const GREY_TEXT  = [107, 107, 94]; // #6B6B5E

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function pctColor(pct) {
  if (pct >= 75) return [22, 101, 52];   // green
  if (pct >= 50) return [146, 64, 14];   // amber
  return [185, 28, 28];                  // red
}

function drawHeader(doc, suite, pageWidth) {
  // Green banner
  doc.setFillColor(...GREEN_DARK);
  doc.rect(0, 0, pageWidth, 22, "F");

  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Snehalaya MCQ Portal", 14, 9);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Results Report  Â·  ${suite.name}`, 14, 16);

  // Date top-right
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

// â”€â”€ Main export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function downloadResultsPDF(suite, questions, results) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // â”€â”€ Build per-result stats â”€â”€
  const statsPerResult = results.map(r => {
    // category breakdown
    const catMap = {};
    questions.forEach(q => {
      const cat = q.category || "Uncategorized";
      if (!catMap[cat]) catMap[cat] = { total: 0, correct: 0, marks: 0, earned: 0 };
      catMap[cat].total++;
      catMap[cat].marks += q.marks ?? 1;
    });

    (r.answers || []).forEach(ans => {
      const q = questions.find(q => q._id === ans.questionId || q._id?.toString() === ans.questionId?.toString());
      if (!q) return;
      const cat = q.category || "Uncategorized";
      if (!catMap[cat]) catMap[cat] = { total: 0, correct: 0, marks: 0, earned: 0 };
      if (ans.isCorrect) {
        catMap[cat].correct++;
        catMap[cat].earned += q.marks ?? 1;
      }
    });

    const pct = r.totalMarks > 0 ? Math.round((r.score / r.totalMarks) * 100) : 0;
    return { ...r, catMap, pct };
  });

  // â”€â”€ All categories across the suite â”€â”€
  const allCats = [...new Set(questions.map(q => q.category || "Uncategorized"))];

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  PAGE 1  â€”  SUMMARY SHEET
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  drawHeader(doc, suite, pageWidth);

  // Section title
  let y = 30;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREEN_DARK);
  doc.text("Summary â€” All Students", 14, y);

  // Suite info chips
  y += 7;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY_TEXT);
  doc.text(
    `${results.length} student${results.length !== 1 ? "s" : ""}   Â·   ${questions.length} question${questions.length !== 1 ? "s" : ""}   Â·   ${questions.reduce((a, q) => a + (q.marks ?? 1), 0)} total marks`,
    14, y
  );

  y += 6;

  // Summary table columns: Name | Email | Score | % | Pass/Fail | one col per category
  const summaryHead = [
    ["#", "Student Name", "Email", "Score", "%", "Result", ...allCats.map(c => c.length > 12 ? c.slice(0, 11) + "â€¦" : c)],
  ];

  const summaryBody = statsPerResult.map((r, i) => {
    const catCols = allCats.map(cat => {
      const s = r.catMap[cat];
      if (!s) return "â€”";
      const p = s.marks > 0 ? Math.round((s.earned / s.marks) * 100) : 0;
      return `${s.correct}/${s.total} (${p}%)`;
    });
    return [
      i + 1,
      r.studentName || "â€”",
      r.studentEmail || "â€”",
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
      fontSize: 8,
      cellPadding: 3,
      font: "helvetica",
      textColor: [30, 30, 30],
      lineColor: [220, 220, 215],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: GREEN_DARK,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 247, 244] },
    columnStyles: {
      0: { cellWidth: 7, halign: "center" },
      3: { halign: "center" },
      4: { halign: "center", fontStyle: "bold" },
      5: { halign: "center", fontStyle: "bold" },
    },
    didParseCell(data) {
      // Colour the % and Pass/Fail cells
      if (data.section === "body") {
        if (data.column.index === 4) {
          const pct = parseInt(data.cell.text[0]);
          data.cell.styles.textColor = pctColor(pct);
        }
        if (data.column.index === 5) {
          data.cell.styles.textColor = data.cell.text[0] === "Pass" ? [22, 101, 52] : [185, 28, 28];
        }
        // Category % colouring
        if (data.column.index >= 6) {
          const txt = data.cell.text[0];
          const m = txt.match(/\((\d+)%\)/);
          if (m) data.cell.styles.textColor = pctColor(parseInt(m[1]));
        }
      }
    },
    didDrawPage(data) {
      const pg = doc.internal.getCurrentPageInfo().pageNumber;
      drawFooter(doc, pg, "?", pageWidth, pageHeight);
    },
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  PAGE(S) 2+  â€”  DETAIL SHEET (one section per student)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  doc.addPage();
  drawHeader(doc, suite, pageWidth);

  y = 30;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREEN_DARK);
  doc.text("Detailed Results â€” Per Student", 14, y);
  y += 10;

  statsPerResult.forEach((r, idx) => {
    // Check if we need a new page (leave 60mm for at least one student block)
    if (y > pageHeight - 70) {
      doc.addPage();
      drawHeader(doc, suite, pageWidth);
      y = 30;
    }

    // Student header bar
    doc.setFillColor(...GREEN_LIGHT);
    doc.roundedRect(14, y, pageWidth - 28, 10, 2, 2, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREEN_DARK);
    doc.text(`${idx + 1}. ${r.studentName || "Unknown"}`, 18, y + 6.5);

    // Score + % on right
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...pctColor(r.pct));
    doc.text(`${r.pct}%  (${r.score}/${r.totalMarks} marks)  â€”  ${r.pct >= 50 ? "PASS âœ“" : "FAIL âœ—"}`, pageWidth - 18, y + 6.5, { align: "right" });
    y += 14;

    // Category breakdown mini-table for this student
    const catRows = allCats.map(cat => {
      const s = r.catMap[cat] || { correct: 0, total: 0, marks: 0, earned: 0 };
      const p = s.marks > 0 ? Math.round((s.earned / s.marks) * 100) : 0;
      return [cat, `${s.correct}/${s.total}`, `${s.earned}/${s.marks}`, `${p}%`];
    });

    autoTable(doc, {
      startY: y,
      head: [["Category", "Correct / Total", "Marks Earned", "%"]],
      body: catRows,
      margin: { left: 14, right: 14 },
      tableWidth: (pageWidth - 28) * 0.55,
      styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: [220, 220, 215], lineWidth: 0.2 },
      headStyles: { fillColor: GREEN, textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
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
      didDrawPage(data) {
        drawHeader(doc, suite, pageWidth);
      },
    });

    y = doc.lastAutoTable.finalY + 10;
  });

  // â”€â”€ Fix footer page numbers now we know total pages â”€â”€
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages, pageWidth, pageHeight);
  }

  // â”€â”€ Save â”€â”€
  const safeName = suite.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  doc.save(`results_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}