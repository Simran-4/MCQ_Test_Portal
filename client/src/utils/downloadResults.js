// src/utils/downloadResults.js
// Client-side PDF and Excel exports for suite results.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const GREEN_DARK = [26, 61, 40];
const GREEN_SOFT = [232, 242, 236];
const BG_SOFT = [248, 247, 244];
const WHITE = [255, 255, 255];
const GREY_TEXT = [107, 107, 94];
const BORDER = [220, 220, 215];
function pctColor(pct) {
  if (pct >= 75) return [22, 101, 52];
  if (pct >= 50) return [146, 64, 14];
  return [185, 28, 28];
}

function getQuestionCats(q) {
  if (Array.isArray(q.category) && q.category.length > 0) return q.category;
  if (typeof q.category === "string" && q.category.trim()) {
    return q.category.split(",").map(s => s.trim()).filter(Boolean);
  }
  return ["Uncategorized"];
}

function isTheoryQuestion(q) {
  return q?.questionType === "theory";
}

function getCategoryAnswerMap(q) {
  if (!q?.categoryCorrectAnswers) return {};
  if (q.categoryCorrectAnswers instanceof Map) return Object.fromEntries(q.categoryCorrectAnswers);
  return q.categoryCorrectAnswers;
}

function uniqueIndexes(indexes) {
  return [...new Set((Array.isArray(indexes) ? indexes : []).map(Number))]
    .filter(Number.isInteger);
}

function getCorrectAnswersForCategory(q, cat) {
  const fallback = uniqueIndexes(Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]);
  const map = getCategoryAnswerMap(q);
  const categoryAnswers = uniqueIndexes(map[cat]);
  return categoryAnswers.length > 0 ? categoryAnswers : fallback;
}

function scoreSelected(selectedArr, correctArr) {
  if (correctArr.length === 0) return { earnedFrac: 0, isRight: false };
  const hits = selectedArr.filter(i => correctArr.includes(i)).length;
  const wrongs = selectedArr.filter(i => !correctArr.includes(i)).length;
  const earnedFrac = Math.max(0, (hits - wrongs) / correctArr.length);
  return { earnedFrac, isRight: earnedFrac === 1 };
}

function formatNumber(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function safeName(name) {
  return String(name || "results").replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function candidateName(r) {
  return r.CandidateName || r.userName || "Unknown";
}

function candidateEmail(r) {
  return r.CandidateEmail || r.userEmail || "-";
}

function suitePassingPercentage(suite) {
  return Number.isFinite(Number(suite?.passingPercentage)) ? Number(suite.passingPercentage) : 50;
}

function resultStatus(r, suite) {
  if (typeof r.passed === "boolean") return r.passed ? "Pass" : "Fail";
  return r.pct >= suitePassingPercentage(suite) ? "Pass" : "Fail";
}

function optionLabels(q, indexes) {
  return uniqueIndexes(indexes)
    .map(i => q.options?.[i])
    .filter(Boolean)
    .join(", ");
}

async function loadImageAsDataUrl(src) {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function buildStats(suite, questions, results) {
  const scoredQuestions = questions.filter(q => !isTheoryQuestion(q));
  const allCats = [...new Set(scoredQuestions.flatMap(q => getQuestionCats(q)))];
  const statsPerResult = results.map(r => {
    const catMap = {};

    scoredQuestions.forEach(q => {
      const marks = q.marks ?? 1;
      getQuestionCats(q).forEach(cat => {
        if (!catMap[cat]) catMap[cat] = { total: 0, correct: 0, marks: 0, earned: 0 };
        catMap[cat].total += 1;
        catMap[cat].marks += marks;
      });
    });

    (r.answers || []).forEach(ans => {
      const q = questions.find(q =>
        q._id === ans.questionId || q._id?.toString() === ans.questionId?.toString()
      );
      if (!q || isTheoryQuestion(q)) return;

      const selectedArr = Array.isArray(ans.selectedOptions) ? ans.selectedOptions : [];
      const marks = q.marks ?? 1;
      getQuestionCats(q).forEach(cat => {
        if (!catMap[cat]) catMap[cat] = { total: 0, correct: 0, marks: 0, earned: 0 };
        const { earnedFrac, isRight } = scoreSelected(
          selectedArr,
          getCorrectAnswersForCategory(q, cat)
        );
        if (isRight) catMap[cat].correct += 1;
        catMap[cat].earned += earnedFrac * marks;
      });
    });

    const pct = r.totalMarks > 0 ? Math.round(((r.score ?? 0) / r.totalMarks) * 100) : 0;
    return { ...r, catMap, pct };
  });

  const totalMarksAll = scoredQuestions.reduce((sum, q) => sum + (q.marks ?? 1), 0);
  return { suite, questions, results: statsPerResult, allCats, totalMarksAll };
}

function categoryRowsForResult(r, allCats) {
  return allCats.map(cat => {
    const s = r.catMap[cat] || { correct: 0, total: 0, marks: 0, earned: 0 };
    const pct = s.marks > 0 ? Math.round((s.earned / s.marks) * 100) : 0;
    const grade = pct >= 70 ? "High" : pct >= 40 ? "Moderate" : "Low";
    return {
      category: cat,
      correct: s.correct,
      total: s.total,
      earned: formatNumber(s.earned),
      marks: formatNumber(s.marks),
      pct,
      grade,
    };
  });
}

function questionRowsForResult(r, questions) {
  return questions.map((q, idx) => {
    const ans = (r.answers || []).find(a =>
      q._id === a.questionId || q._id?.toString() === a.questionId?.toString()
    );
    const selectedArr = Array.isArray(ans?.selectedOptions) ? ans.selectedOptions : [];
    const cats = getQuestionCats(q);

    if (isTheoryQuestion(q)) {
      return {
        number: idx + 1,
        question: q.questionText || "-",
        categories: cats.join(", "),
        selected: ans?.textAnswer || "Not answered",
        correct: "Theory answer - review manually",
        score: "Not auto-scored",
      };
    }

    const catAnswerText = cats.map(cat => {
      const labels = optionLabels(q, getCorrectAnswersForCategory(q, cat)) || "-";
      return `${cat}: ${labels}`;
    }).join("; ");
    const catScoreText = cats.map(cat => {
      const { earnedFrac, isRight } = scoreSelected(selectedArr, getCorrectAnswersForCategory(q, cat));
      const earned = formatNumber(earnedFrac * (q.marks ?? 1));
      return `${cat}: ${isRight ? "Correct" : "Incorrect"} (${earned}/${q.marks ?? 1})`;
    }).join("; ");

    return {
      number: idx + 1,
      question: q.questionText || "-",
      categories: cats.join(", "),
      selected: optionLabels(q, selectedArr) || "Not answered",
      correct: catAnswerText,
      score: catScoreText,
    };
  });
}

function drawHeader(doc, suite, reportTitle, logoDataUrl, pageWidth) {
  doc.setFillColor(...GREEN_DARK);
  doc.rect(0, 0, pageWidth, 25, "F");

  if (logoDataUrl) {
    doc.setFillColor(...WHITE);
    doc.roundedRect(12, 5, 15, 15, 2, 2, "F");
    doc.addImage(logoDataUrl, "PNG", 13.5, 6.5, 12, 12);
  }

  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Snehalaya MCQ Portal", logoDataUrl ? 32 : 14, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`${reportTitle} - ${suite?.name || "Test Suite"}`, logoDataUrl ? 32 : 14, 16);

  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  doc.text(dateStr, pageWidth - 14, 16, { align: "right" });
}

function drawFooter(doc, pageNum, totalPages, pageWidth, pageHeight) {
  doc.setDrawColor(...BORDER);
  doc.line(14, pageHeight - 10, pageWidth - 14, pageHeight - 10);
  doc.setTextColor(...GREY_TEXT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 5.5, { align: "center" });
}

function drawMetricCards(doc, stats, y, pageWidth) {
  const cardWidth = (pageWidth - 40) / 4;
  const cards = [
    ["Candidates", stats.results.length],
    ["Questions", stats.questions.length],
    ["Total Marks", stats.totalMarksAll],
    ["Categories", stats.allCats.length],
  ];

  cards.forEach(([label, value], idx) => {
    const x = 14 + idx * (cardWidth + 4);
    doc.setFillColor(...BG_SOFT);
    doc.roundedRect(x, y, cardWidth, 18, 3, 3, "F");
    doc.setTextColor(...GREY_TEXT);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label, x + 4, y + 6);
    doc.setTextColor(...GREEN_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(String(value), x + 4, y + 14);
  });
}

function addStyledTable(doc, config) {
  autoTable(doc, {
    margin: { left: 14, right: 14 },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 2.4,
      textColor: [30, 30, 30],
      lineColor: BORDER,
      lineWidth: 0.2,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: GREEN_DARK,
      textColor: WHITE,
      fontStyle: "bold",
      halign: "center",
    },
    alternateRowStyles: { fillColor: BG_SOFT },
    ...config,
  });
}

function addPageNumbers(doc, pageWidth, pageHeight) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages, pageWidth, pageHeight);
  }
}

function savePdf(doc, suite, reportType) {
  doc.save(`${reportType}_results_${safeName(suite?.name)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function gradeClass(grade) {
  return String(grade || "").toLowerCase();
}

function buildDescriptiveReportHtml(stats, logoDataUrl) {
  const generatedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const summaryRows = stats.results.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(candidateName(r))}</strong><br><span>${escapeHtml(candidateEmail(r))}</span></td>
      <td>${escapeHtml(r.project || "-")}<br><span>${escapeHtml(r.designation || "-")}</span></td>
      <td><strong>${escapeHtml(`${r.score ?? 0}/${r.totalMarks ?? 0}`)}</strong></td>
      <td class="pct pct-${r.pct >= 75 ? "high" : r.pct >= 50 ? "moderate" : "low"}">${r.pct}%</td>
      <td>${escapeHtml(resultStatus(r, stats.suite))}</td>
      <td>${categoryRowsForResult(r, stats.allCats).map(row => `
        <div class="mini-cat">
          <span>${escapeHtml(row.category)}</span>
          <b>${row.correct}/${row.total} (${row.pct}%)</b>
        </div>
      `).join("")}</td>
    </tr>
  `).join("");

  const candidateSections = stats.results.map((r, idx) => {
    const categoryRows = categoryRowsForResult(r, stats.allCats).map(row => `
      <tr>
        <td>${escapeHtml(row.category)}</td>
        <td>${row.correct}/${row.total}</td>
        <td>${row.earned}/${row.marks}</td>
        <td class="pct pct-${row.pct >= 75 ? "high" : row.pct >= 50 ? "moderate" : "low"}">${row.pct}%</td>
        <td><span class="grade ${gradeClass(row.grade)}">${escapeHtml(row.grade)}</span></td>
      </tr>
    `).join("");

    const questionRows = questionRowsForResult(r, stats.questions).map(row => `
      <tr>
        <td class="q-no">${row.number}</td>
        <td class="q-text">${escapeHtml(row.question)}</td>
        <td>${escapeHtml(row.categories)}</td>
        <td>${escapeHtml(row.selected)}</td>
        <td>${escapeHtml(row.correct)}</td>
        <td>${escapeHtml(row.score)}</td>
      </tr>
    `).join("");

    return `
      <section class="candidate-section">
        <div class="candidate-card">
          <div>
            <div class="candidate-index">Candidate ${idx + 1}</div>
            <h2>${escapeHtml(candidateName(r))}</h2>
            <p>${escapeHtml(candidateEmail(r))} • ${escapeHtml(r.project || "-")} • ${escapeHtml(r.designation || "-")}</p>
          </div>
          <div class="score-pill ${r.pct >= 75 ? "high" : r.pct >= 50 ? "moderate" : "low"}">
            <strong>${r.pct}%</strong>
            <span>${escapeHtml(`${r.score ?? 0}/${r.totalMarks ?? 0}`)}</span>
          </div>
        </div>

        <h3>Category Breakdown</h3>
        <table class="report-table compact">
          <thead>
            <tr>
              <th>Category</th>
              <th>Correct / Total</th>
              <th>Marks</th>
              <th>%</th>
              <th>Level</th>
            </tr>
          </thead>
          <tbody>${categoryRows}</tbody>
        </table>

        <h3>Question-wise Detail</h3>
        <table class="report-table questions">
          <thead>
            <tr>
              <th>Q</th>
              <th>Question</th>
              <th>Category</th>
              <th>Selected</th>
              <th>Correct Answer</th>
              <th>Category Score</th>
            </tr>
          </thead>
          <tbody>${questionRows}</tbody>
        </table>
      </section>
    `;
  }).join("");

  return `
    <style>
      .descriptive-report {
        width: 1120px;
        box-sizing: border-box;
        padding: 28px;
        background: #f8f7f4;
        color: #1b1f1d;
        font-family: "Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", "Arial Unicode MS", Arial, sans-serif;
      }
      .report-header {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 18px;
        align-items: center;
        background: #1a3d28;
        color: white;
        border-radius: 18px;
        padding: 18px 22px;
        margin-bottom: 18px;
      }
      .report-header img {
        width: 62px;
        height: 62px;
        object-fit: contain;
        background: white;
        border-radius: 14px;
        padding: 5px;
      }
      .report-header h1 {
        margin: 0 0 5px;
        font-size: 25px;
        line-height: 1.15;
      }
      .report-header p,
      .report-header span {
        margin: 0;
        font-size: 14px;
        opacity: 0.9;
      }
      .metric-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 18px;
      }
      .metric-card {
        background: white;
        border: 1px solid #dfe7e2;
        border-radius: 14px;
        padding: 14px 16px;
      }
      .metric-card span {
        display: block;
        color: #6b716f;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .metric-card strong {
        display: block;
        color: #1a3d28;
        font-size: 27px;
        margin-top: 6px;
      }
      .report-block,
      .candidate-section {
        background: white;
        border: 1px solid #dfe7e2;
        border-radius: 18px;
        padding: 18px;
        margin-bottom: 18px;
        break-inside: avoid;
      }
      .candidate-section {
        page-break-before: always;
      }
      .candidate-card {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        background: #e8f2ec;
        border-radius: 14px;
        padding: 14px 16px;
        margin-bottom: 16px;
      }
      .candidate-index {
        color: #4f6b59;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }
      .candidate-card h2 {
        margin: 3px 0;
        color: #1a3d28;
        font-size: 22px;
      }
      .candidate-card p {
        margin: 0;
        color: #56625c;
        font-size: 13px;
      }
      .score-pill {
        min-width: 92px;
        border-radius: 14px;
        padding: 10px 12px;
        text-align: center;
        background: #fef3c7;
        color: #92400e;
      }
      .score-pill.high {
        background: #dcfce7;
        color: #166534;
      }
      .score-pill.low {
        background: #fee2e2;
        color: #991b1b;
      }
      .score-pill strong,
      .score-pill span {
        display: block;
      }
      .score-pill strong {
        font-size: 24px;
      }
      h2, h3 {
        color: #1a3d28;
      }
      h3 {
        margin: 14px 0 8px;
        font-size: 16px;
      }
      .report-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 12px;
      }
      .report-table th {
        background: #1a3d28;
        color: white;
        padding: 9px 8px;
        text-align: left;
        font-size: 11px;
        text-transform: uppercase;
      }
      .report-table td {
        border: 1px solid #e2e8e4;
        padding: 8px;
        vertical-align: top;
        overflow-wrap: anywhere;
        line-height: 1.45;
      }
      .report-table tbody tr:nth-child(even) td {
        background: #fbfaf8;
      }
      .summary-table th:nth-child(1),
      .summary-table td:nth-child(1),
      .report-table .q-no {
        text-align: center;
        width: 36px;
      }
      .summary-table th:nth-child(2) { width: 170px; }
      .summary-table th:nth-child(3) { width: 165px; }
      .summary-table th:nth-child(4) { width: 80px; }
      .summary-table th:nth-child(5) { width: 62px; }
      .questions th:nth-child(1) { width: 34px; }
      .questions th:nth-child(2) { width: 310px; }
      .questions th:nth-child(3) { width: 130px; }
      .questions th:nth-child(4) { width: 150px; }
      .questions th:nth-child(5) { width: 230px; }
      .questions th:nth-child(6) { width: 200px; }
      .q-text {
        font-weight: 800;
        color: #123323;
      }
      .report-table span,
      .mini-cat span {
        color: #69736f;
        font-size: 11px;
      }
      .pct {
        font-weight: 900;
      }
      .pct-high { color: #166534; }
      .pct-moderate { color: #92400e; }
      .pct-low { color: #991b1b; }
      .grade {
        display: inline-block;
        border-radius: 999px;
        padding: 3px 8px;
        font-weight: 900;
        font-size: 11px;
      }
      .grade.high {
        color: #166534;
        background: #dcfce7;
      }
      .grade.moderate {
        color: #92400e;
        background: #fef3c7;
      }
      .grade.low {
        color: #991b1b;
        background: #fee2e2;
      }
      .mini-cat {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        border-bottom: 1px solid #eef2ef;
        padding: 3px 0;
      }
      .mini-cat:last-child {
        border-bottom: 0;
      }
    </style>
    <div class="descriptive-report">
      <header class="report-header">
        ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Snehalaya logo" />` : ""}
        <div>
          <h1>Descriptive Results Report</h1>
          <p>${escapeHtml(stats.suite?.name || "Test Suite")}</p>
        </div>
        <span>${escapeHtml(generatedDate)}</span>
      </header>

      <section class="metric-grid">
        <div class="metric-card"><span>Candidates</span><strong>${stats.results.length}</strong></div>
        <div class="metric-card"><span>Questions</span><strong>${stats.questions.length}</strong></div>
        <div class="metric-card"><span>Total Marks</span><strong>${stats.totalMarksAll}</strong></div>
        <div class="metric-card"><span>Categories</span><strong>${stats.allCats.length}</strong></div>
      </section>

      <section class="report-block">
        <h2>Candidate Summary</h2>
        <table class="report-table summary-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Candidate</th>
              <th>Project / Designation</th>
              <th>Score</th>
              <th>%</th>
              <th>Result</th>
              <th>Category Summary</th>
            </tr>
          </thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </section>

      ${candidateSections}
    </div>
  `;
}

async function renderHtmlToCanvas(html) {
  const { default: html2canvas } = await import("html2canvas");
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "1120px";
  wrapper.style.pointerEvents = "none";
  wrapper.style.zIndex = "-1";
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(
      Array.from(wrapper.querySelectorAll("img")).map(img => (
        img.complete
          ? Promise.resolve()
          : new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
            })
      ))
    );

    return await html2canvas(wrapper.firstElementChild, {
      backgroundColor: "#f8f7f4",
      scale: 1.6,
      useCORS: true,
      logging: false,
      windowWidth: 1120,
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    wrapper.remove();
  }
}

function addCanvasPagesToPdf(canvas, suite, reportType) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidthMm = doc.internal.pageSize.getWidth();
  const pageHeightMm = doc.internal.pageSize.getHeight();
  const sliceHeight = Math.floor(canvas.width * (pageHeightMm / pageWidthMm));
  const pageCanvas = document.createElement("canvas");
  const pageCtx = pageCanvas.getContext("2d");
  pageCanvas.width = canvas.width;

  let page = 0;
  for (let sourceY = 0; sourceY < canvas.height; sourceY += sliceHeight) {
    const currentSliceHeight = Math.min(sliceHeight, canvas.height - sourceY);
    pageCanvas.height = currentSliceHeight;
    pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageCtx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      currentSliceHeight,
      0,
      0,
      pageCanvas.width,
      currentSliceHeight
    );

    if (page > 0) doc.addPage();
    const imageHeightMm = (currentSliceHeight / canvas.width) * pageWidthMm;
    doc.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, pageWidthMm, imageHeightMm);
    page += 1;
  }

  savePdf(doc, suite, reportType);
}

async function downloadDescriptivePdfAsImages(suite, stats, logoDataUrl) {
  const canvas = await renderHtmlToCanvas(buildDescriptiveReportHtml(stats, logoDataUrl));
  addCanvasPagesToPdf(canvas, suite, "descriptive");
}

function buildWorkbookSummary(wb, stats) {
  const headers = [
    "#",
    "Candidate Name",
    "Email",
    "Project",
    "Department",
    "Score",
    "Total Marks",
    "Percentage",
    "Result",
    ...stats.allCats.map(cat => `${cat} %`),
    ...stats.allCats.map(cat => `${cat} Correct/Total`),
  ];
  const rows = stats.results.map((r, i) => {
    const catPcts = stats.allCats.map(cat => {
      const row = categoryRowsForResult(r, stats.allCats).find(item => item.category === cat);
      return row?.pct ?? 0;
    });
    const catScores = stats.allCats.map(cat => {
      const row = categoryRowsForResult(r, stats.allCats).find(item => item.category === cat);
      return row ? `${row.correct}/${row.total}` : "0/0";
    });
    return [
      i + 1,
      candidateName(r),
      candidateEmail(r),
      r.project || "",
      r.designation || "",
      r.score ?? 0,
      r.totalMarks ?? 0,
      r.pct,
      resultStatus(r, stats.suite),
      ...catPcts,
      ...catScores,
    ];
  });

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((header, idx) => ({ wch: idx < 2 ? 24 : Math.max(12, Math.min(26, String(header).length + 4)) }));
  XLSX.utils.book_append_sheet(wb, sheet, "Summary");
}

function buildWorkbookDescriptive(wb, stats) {
  const questionHeaders = [
    "Candidate Name",
    "Email",
    "Project",
    "Department",
    "Q No.",
    "Question",
    "Categories",
    "Selected Answer",
    "Correct Answer by Category",
    "Category Score",
  ];
  const questionRows = [];
  stats.results.forEach(r => {
    questionRowsForResult(r, stats.questions).forEach(row => {
      questionRows.push([
        candidateName(r),
        candidateEmail(r),
        r.project || "",
        r.designation || "",
        row.number,
        row.question,
        row.categories,
        row.selected,
        row.correct,
        row.score,
      ]);
    });
  });
  const questionSheet = XLSX.utils.aoa_to_sheet([questionHeaders, ...questionRows]);
  questionSheet["!cols"] = [
    { wch: 24 },
    { wch: 30 },
    { wch: 22 },
    { wch: 24 },
    { wch: 8 },
    { wch: 52 },
    { wch: 24 },
    { wch: 26 },
    { wch: 48 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(wb, questionSheet, "Descriptive Detail");

  const categoryHeaders = [
    "Candidate Name",
    "Email",
    "Project",
    "Department",
    "Category",
    "Correct",
    "Total Qs",
    "Earned Marks",
    "Total Marks",
    "Percentage",
    "Grade",
  ];
  const categoryRows = [];
  stats.results.forEach(r => {
    categoryRowsForResult(r, stats.allCats).forEach(row => {
      categoryRows.push([
        candidateName(r),
        candidateEmail(r),
        r.project || "",
        r.designation || "",
        row.category,
        row.correct,
        row.total,
        row.earned,
        row.marks,
        row.pct,
        row.grade,
      ]);
    });
  });
  const categorySheet = XLSX.utils.aoa_to_sheet([categoryHeaders, ...categoryRows]);
  categorySheet["!cols"] = [
    { wch: 24 },
    { wch: 30 },
    { wch: 22 },
    { wch: 24 },
    { wch: 22 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, categorySheet, "Category Detail");
}

export async function downloadResultsPDF(suite, questions, results, options = {}) {
  const reportType = options.reportType === "descriptive" ? "descriptive" : "summary";
  const reportTitle = reportType === "descriptive" ? "Descriptive Results Report" : "Summary Results Report";
  const stats = buildStats(suite, questions, results);
  const logoDataUrl = await loadImageAsDataUrl(`${window.location.origin}/Logo.png`);

  if (reportType === "descriptive") {
    await downloadDescriptivePdfAsImages(suite, stats, logoDataUrl);
    return;
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  drawHeader(doc, suite, reportTitle, logoDataUrl, pageWidth);
  let y = 34;
  drawMetricCards(doc, stats, y, pageWidth);
  y += 28;

  doc.setTextColor(...GREEN_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(reportType === "descriptive" ? "Candidate Summary" : "All Candidates", 14, y);
  y += 6;

  const summaryHead = [["#", "Candidate", "Email", "Score", "%", "Result", ...stats.allCats.map(cat => cat.length > 12 ? `${cat.slice(0, 11)}...` : cat)]];
  const summaryBody = stats.results.map((r, i) => {
    const catCols = categoryRowsForResult(r, stats.allCats).map(row => `${row.correct}/${row.total} (${row.pct}%)`);
    return [
      i + 1,
      candidateName(r),
      candidateEmail(r),
      `${r.score ?? 0}/${r.totalMarks ?? 0}`,
      `${r.pct}%`,
      resultStatus(r, stats.suite),
      ...catCols,
    ];
  });

  addStyledTable(doc, {
    startY: y,
    head: summaryHead,
    body: summaryBody,
    columnStyles: {
      0: { cellWidth: 7, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: 36 },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      5: { cellWidth: 14, halign: "center", fontStyle: "bold" },
    },
    didParseCell(data) {
      if (data.section !== "body") return;
      if (data.column.index === 4) data.cell.styles.textColor = pctColor(parseInt(data.cell.text[0], 10));
      if (data.column.index === 5) data.cell.styles.textColor = data.cell.text[0] === "Pass" ? [22, 101, 52] : [185, 28, 28];
    },
  });

  if (reportType === "descriptive") {
    stats.results.forEach((r, idx) => {
      doc.addPage();
      drawHeader(doc, suite, reportTitle, logoDataUrl, pageWidth);
      let detailY = 34;

      doc.setFillColor(...GREEN_SOFT);
      doc.roundedRect(14, detailY, pageWidth - 28, 16, 3, 3, "F");
      doc.setTextColor(...GREEN_DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`${idx + 1}. ${candidateName(r)}`, 18, detailY + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(candidateEmail(r), 18, detailY + 12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...pctColor(r.pct));
      doc.text(`${r.pct}% (${r.score ?? 0}/${r.totalMarks ?? 0})`, pageWidth - 18, detailY + 10, { align: "right" });
      detailY += 24;

      addStyledTable(doc, {
        startY: detailY,
        head: [["Category", "Correct / Total", "Marks", "%", "Level"]],
        body: categoryRowsForResult(r, stats.allCats).map(row => [
          row.category,
          `${row.correct}/${row.total}`,
          `${row.earned}/${row.marks}`,
          `${row.pct}%`,
          row.grade,
        ]),
        tableWidth: pageWidth - 28,
        columnStyles: {
          1: { halign: "center" },
          2: { halign: "center" },
          3: { halign: "center", fontStyle: "bold" },
          4: { halign: "center" },
        },
        didParseCell(data) {
          if (data.section === "body" && data.column.index === 3) {
            data.cell.styles.textColor = pctColor(parseInt(data.cell.text[0], 10));
          }
        },
      });

      detailY = doc.lastAutoTable.finalY + 10;
      doc.setTextColor(...GREEN_DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Question-wise Detail", 14, detailY);
      detailY += 5;

      addStyledTable(doc, {
        startY: detailY,
        head: [["Q", "Question", "Category", "Selected", "Correct Answer", "Category Score"]],
        body: questionRowsForResult(r, stats.questions).map(row => [
          row.number,
          row.question,
          row.categories,
          row.selected,
          row.correct,
          row.score,
        ]),
        styles: { fontSize: 6.7, cellPadding: 2, overflow: "linebreak", valign: "top" },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 44 },
          2: { cellWidth: 25 },
          3: { cellWidth: 22 },
          4: { cellWidth: 38 },
          5: { cellWidth: 40 },
        },
      });
    });
  }

  addPageNumbers(doc, pageWidth, pageHeight);
  savePdf(doc, suite, reportType);
}

export function downloadResultsExcel(suite, questions, results, options = {}) {
  const reportType = options.reportType === "descriptive" ? "descriptive" : "summary";
  const stats = buildStats(suite, questions, results);
  const wb = XLSX.utils.book_new();

  if (reportType === "summary") {
    buildWorkbookSummary(wb, stats);
  } else {
    buildWorkbookDescriptive(wb, stats);
  }

  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Views = [{ activeTab: 0 }];

  XLSX.writeFile(
    wb,
    `${reportType}_results_${safeName(suite?.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
