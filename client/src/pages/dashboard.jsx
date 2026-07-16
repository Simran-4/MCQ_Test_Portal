// src/pages/Dashboard.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { downloadExcelWorkbook, downloadPdfDocument } from "../utils/pdfDownload";
import { downloadCanvasTablePdf } from "../utils/canvasTablePdf";
import * as XLSX from "xlsx";
import "./dashboard.css";
import { canAdmin, getAuthHeaders } from "../utils/auth";
import { registerPathForNext } from "../utils/authRedirect";
import BulkMailPanel from "../components/BulkMailPanel";
import LanguageSwitcher from "../components/LanguageSwitcher";

const API = import.meta.env.VITE_API_URL || "";
const DEVANAGARI_FONT_NAME = "NotoSansDevanagari";
const DEVANAGARI_FONT_FILE = "NotoSansDevanagari-Regular.ttf";

function publicAssetUrl(path) {
  const base = import.meta.env.BASE_URL || "/";
  return new URL(`${base}${String(path || "").replace(/^\/+/, "")}`, window.location.origin).href;
}

const ADMIN_DASHBOARD_COPY = {
  en: {
    platform: "Test Taking Platform",
    welcomeBack: "Welcome back, Admin",
    welcomeText: "Manage test suites and questions with ease.",
    today: "Today",
    administrator: "Administrator",
    logout: "Logout",
    dashboard: "Dashboard",
    testManagement: "Test Management",
    allTestSuites: "All Test Suites",
    addTestSuite: "Add Test Suite",
    assignTestSuites: "Assign Test Suites",
    results: "Results",
    allTestResults: "All Test Results",
    userPersonalReports: "User Personal Reports",
    bulkMail: "Bulk Mail",
    testReport: "Test Report",
    trash: "Trash",
    testSuites: "Test Suites",
    activeSuites: "Active Suites",
    totalCandidates: "Total Candidates",
    totalResponses: "Total Responses",
    totalSuites: "Total suites",
    liveRightNow: "Live right now",
    registeredCandidates: "Registered candidates",
    submittedTests: "Submitted tests",
    suiteIntro: "Create, manage and monitor your test suites.",
    searchSuites: "Search test suites...",
    period: "Period",
    allTime: "All time",
    from: "From",
    to: "To",
    clear: "Clear",
    newTestSuite: "New test suite",
    loadingSuites: "Loading your suites...",
    noSuites: "No suites available. Create your first one above.",
    noMatchingSuites: "No test suites match the selected search or date/time period.",
  },
  hi: {
    platform: "टेस्ट टेकिंग प्लेटफॉर्म",
    welcomeBack: "वापसी पर स्वागत है, एडमिन",
    welcomeText: "टेस्ट सूट और प्रश्न आसानी से प्रबंधित करें.",
    today: "आज",
    administrator: "प्रशासक",
    logout: "लॉग आउट",
    dashboard: "डैशबोर्ड",
    testManagement: "टेस्ट प्रबंधन",
    allTestSuites: "सभी टेस्ट सूट",
    addTestSuite: "टेस्ट सूट जोड़ें",
    assignTestSuites: "टेस्ट सूट असाइन करें",
    results: "परिणाम",
    allTestResults: "सभी टेस्ट परिणाम",
    userPersonalReports: "यूजर व्यक्तिगत रिपोर्ट",
    bulkMail: "बल्क मेल",
    testReport: "टेस्ट रिपोर्ट",
    trash: "ट्रैश",
    testSuites: "टेस्ट सूट",
    activeSuites: "सक्रिय सूट",
    totalCandidates: "कुल उम्मीदवार",
    totalResponses: "कुल प्रतिक्रियाएं",
    totalSuites: "कुल सूट",
    liveRightNow: "अभी लाइव",
    registeredCandidates: "पंजीकृत उम्मीदवार",
    submittedTests: "जमा किए गए टेस्ट",
    suiteIntro: "अपने टेस्ट सूट बनाएं, प्रबंधित करें और मॉनिटर करें.",
    searchSuites: "टेस्ट सूट खोजें...",
    period: "अवधि",
    allTime: "सभी समय",
    from: "से",
    to: "तक",
    clear: "साफ करें",
    newTestSuite: "नया टेस्ट सूट",
    loadingSuites: "आपके सूट लोड हो रहे हैं...",
    noSuites: "कोई सूट उपलब्ध नहीं है. ऊपर अपना पहला बनाएं.",
    noMatchingSuites: "चयनित खोज या तारीख/समय अवधि से कोई टेस्ट सूट मेल नहीं खाता.",
  },
  mr: {
    platform: "टेस्ट टेकिंग प्लॅटफॉर्म",
    welcomeBack: "पुन्हा स्वागत आहे, अॅडमिन",
    welcomeText: "टेस्ट सूट आणि प्रश्न सहज व्यवस्थापित करा.",
    today: "आज",
    administrator: "प्रशासक",
    logout: "लॉग आउट",
    dashboard: "डॅशबोर्ड",
    testManagement: "टेस्ट व्यवस्थापन",
    allTestSuites: "सर्व टेस्ट सूट",
    addTestSuite: "टेस्ट सूट जोडा",
    assignTestSuites: "टेस्ट सूट असाइन करा",
    results: "निकाल",
    allTestResults: "सर्व टेस्ट निकाल",
    userPersonalReports: "वापरकर्ता वैयक्तिक अहवाल",
    bulkMail: "बल्क मेल",
    testReport: "टेस्ट अहवाल",
    trash: "ट्रॅश",
    testSuites: "टेस्ट सूट",
    activeSuites: "सक्रिय सूट",
    totalCandidates: "एकूण उमेदवार",
    totalResponses: "एकूण प्रतिसाद",
    totalSuites: "एकूण सूट",
    liveRightNow: "सध्या लाईव्ह",
    registeredCandidates: "नोंदणीकृत उमेदवार",
    submittedTests: "सबमिट केलेले टेस्ट",
    suiteIntro: "तुमचे टेस्ट सूट तयार करा, व्यवस्थापित करा आणि मॉनिटर करा.",
    searchSuites: "टेस्ट सूट शोधा...",
    period: "कालावधी",
    allTime: "सर्व वेळ",
    from: "पासून",
    to: "पर्यंत",
    clear: "साफ करा",
    newTestSuite: "नवीन टेस्ट सूट",
    loadingSuites: "तुमचे सूट लोड होत आहेत...",
    noSuites: "कोणतेही सूट उपलब्ध नाहीत. वर तुमचा पहिला तयार करा.",
    noMatchingSuites: "निवडलेल्या शोध किंवा तारीख/वेळ कालावधीशी कोणतेही टेस्ट सूट जुळत नाहीत.",
  },
};

function adminDashboardCopy(language) {
  const key = String(language || "en").split("-")[0];
  return ADMIN_DASHBOARD_COPY[key] || ADMIN_DASHBOARD_COPY.en;
}

function userContact(user) {
  return user.email || user.mobile || user.username || "";
}

function userLabel(user) {
  const contact = userContact(user);
  return `${user.name}${contact ? ` - ${contact}` : ""}`;
}

function keepSelectedUserVisible(options, selectedUser) {
  if (!selectedUser?._id || options.some(user => user._id === selectedUser._id)) return options;
  return [selectedUser, ...options];
}

function userMatchesReportSearch(user, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return [
    userLabel(user),
    userContact(user),
    user?.email,
    user?.mobile,
    user?.username,
    user?.name,
    user?.role,
    user?.project,
    user?.designation,
  ].filter(Boolean).join(" ").toLowerCase().includes(q);
}

function uniqueSortedValues(values) {
  return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function deletedByLabel(user) {
  if (!user) return "-";
  return user.name || user.email || user.username || "-";
}

function assignedUserIdsForSuite(suite) {
  return (suite.assignedUsers || []).map(item => String(item?._id || item));
}

function firstPresent(...values) {
  const found = values.find(value => value !== undefined && value !== null && String(value).trim() !== "");
  return found === undefined ? "" : String(found).trim();
}

function resultCandidateName(result, fallbackUser = null) {
  return firstPresent(result?.CandidateName, result?.userName, fallbackUser?.name, fallbackUser?.username, "Unknown");
}

function resultCandidateContact(result, fallbackUser = null) {
  return firstPresent(result?.CandidateEmail, result?.userEmail, fallbackUser?.email, fallbackUser?.mobile, fallbackUser?.username, "-");
}

function resultProject(result, fallbackUser = null) {
  return firstPresent(result?.project, fallbackUser?.project, "-");
}

function resultDesignation(result, fallbackUser = null) {
  return firstPresent(result?.designation, fallbackUser?.designation, "-");
}

function resultPct(result) {
  return result.totalMarks > 0 ? Math.round(((result.score || 0) / result.totalMarks) * 100) : 0;
}

function resultTestName(result) {
  return firstPresent(result?.testName, result?.suiteId?.name, "Assessment");
}

function resultStatus(result) {
  if (typeof result.passed === "boolean") return result.passed ? "Pass" : "Fail";
  return resultPct(result) >= 50 ? "Pass" : "Fail";
}

function resultGrade(result) {
  const pct = resultPct(result);
  if (pct >= 75) return "High";
  if (pct >= 50) return "Moderate";
  return "Low";
}

function categoryLabel(category) {
  if (category?.scaleLabel) return category.scaleLabel;
  const pct = Number(category?.percentage || 0);
  if (pct >= 75) return "High";
  if (pct >= 50) return "Moderate";
  return "Low";
}

function categoryScoreLabel(category) {
  if (category?.scaleScore) return `${category.scaleScore}/10`;
  return `${category.percentage || 0}%`;
}

function categoryRowsForResult(result) {
  return Array.isArray(result.categoryResults) ? result.categoryResults : [];
}

function categoryName(category, index = 0) {
  return firstPresent(category?.category, category?.name, `Category ${index + 1}`);
}

function uniqueIndexes(indexes) {
  return [...new Set((Array.isArray(indexes) ? indexes : []).map(Number))]
    .filter(Number.isInteger);
}

function getAnswerQuestion(answer) {
  return answer?.questionId && typeof answer.questionId === "object" ? answer.questionId : null;
}

function isTheoryQuestion(question) {
  return question?.questionType === "theory";
}

function questionCategories(question, answer) {
  const raw = question?.category?.length ? question.category : answer?.category;
  if (Array.isArray(raw) && raw.length > 0) return raw.filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return raw.split(",").map(item => item.trim()).filter(Boolean);
  return ["Uncategorized"];
}

function categoryAnswerMap(question) {
  const rawMap = question?.categoryCorrectAnswers;
  if (!rawMap) return {};
  if (rawMap instanceof Map) return Object.fromEntries(rawMap);
  return rawMap;
}

function correctIndexesForCategory(question, category) {
  const fallback = uniqueIndexes(question?.correctAnswer);
  const map = categoryAnswerMap(question);
  const categoryAnswers = uniqueIndexes(map?.[category]);
  return categoryAnswers.length > 0 ? categoryAnswers : fallback;
}

function optionLabels(question, indexes) {
  const options = Array.isArray(question?.options) ? question.options : [];
  return uniqueIndexes(indexes)
    .map(index => options[index] || options[index - 1] || `Option ${index + 1}`)
    .filter(Boolean)
    .join(", ");
}

function selectedAnswerLabel(answer, question) {
  if (isTheoryQuestion(question)) return String(answer?.textAnswer || "").trim() || "Not answered";
  return optionLabels(question, answer?.selectedOptions) || "Not answered";
}

function correctAnswerLabel(answer, question) {
  if (!question) return "Question details unavailable";
  if (isTheoryQuestion(question)) return "Theory answer - manual review";
  const label = questionCategories(question, answer)
    .map(category => `${category}: ${optionLabels(question, correctIndexesForCategory(question, category)) || "-"}`)
    .join("; ");
  return label || "Correct answer unavailable";
}

function questionReviewRows(result) {
  return (result.answers || []).map((answer, index) => {
    const question = getAnswerQuestion(answer);
    const categories = questionCategories(question, answer);
    const isCorrect = typeof answer?.isCorrect === "boolean" ? answer.isCorrect : null;
    return {
      number: index + 1,
      question: question?.questionText || `Question ${index + 1}`,
      categories: categories.join(", "),
      selected: selectedAnswerLabel(answer, question),
      correct: correctAnswerLabel(answer, question),
      review: isTheoryQuestion(question)
        ? "Manual review"
        : isCorrect === null ? "Not scored" : isCorrect ? "Correct" : "Incorrect",
      marks: answer?.earnedMarks !== undefined && question?.marks !== undefined
        ? `${answer.earnedMarks}/${question.marks}`
        : answer?.earnedMarks !== undefined ? String(answer.earnedMarks) : "-",
    };
  });
}

function fileSafeName(value) {
  return String(value || "user").replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function addDevanagariFont(doc) {
  try {
    const res = await fetch(publicAssetUrl(`fonts/${DEVANAGARI_FONT_FILE}`));
    if (!res.ok) throw new Error("Font file unavailable");
    const fontBase64 = arrayBufferToBase64(await res.arrayBuffer());
    doc.addFileToVFS(DEVANAGARI_FONT_FILE, fontBase64);
    doc.addFont(DEVANAGARI_FONT_FILE, DEVANAGARI_FONT_NAME, "normal");
    return DEVANAGARI_FONT_NAME;
  } catch (err) {
    console.warn("Unable to load Devanagari PDF font. Falling back to Helvetica.", err);
    return "helvetica";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildAdminReportHtml({ title, generatedAt, columns, rows }) {
  const head = columns.map(column => `<th>${escapeHtml(column)}</th>`).join("");
  const body = rows.map(row => `
    <tr>
      ${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}
    </tr>
  `).join("");

  return `
    <style>
      @font-face {
        font-family: "Noto Sans Devanagari Local";
        src: url("${publicAssetUrl(`fonts/${DEVANAGARI_FONT_FILE}`)}") format("truetype");
        font-weight: 400;
        font-style: normal;
      }
      .admin-pdf-report {
        width: 1320px;
        min-height: 760px;
        padding: 34px;
        background: #f8f7f4;
        color: #243028;
        font-family: "Noto Sans Devanagari Local", "Noto Sans Devanagari", "Mangal", "Arial Unicode MS", Arial, sans-serif;
      }
      .admin-pdf-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 24px;
        padding: 22px 26px;
        border-radius: 18px;
        color: #fff;
        background: linear-gradient(135deg, #1a3d28, #1f6b3a);
        box-shadow: 0 18px 42px rgba(26, 61, 40, 0.18);
      }
      .admin-pdf-header h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.2;
      }
      .admin-pdf-header p {
        margin: 7px 0 0;
        color: rgba(255, 255, 255, 0.82);
        font-size: 15px;
      }
      .admin-pdf-table {
        width: 100%;
        margin-top: 24px;
        border-collapse: separate;
        border-spacing: 0;
        overflow: hidden;
        border: 1px solid #dce8df;
        border-radius: 16px;
        background: #fff;
      }
      .admin-pdf-table th,
      .admin-pdf-table td {
        padding: 13px 14px;
        border-bottom: 1px solid #e8eee9;
        text-align: left;
        vertical-align: top;
        font-size: 15px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .admin-pdf-table th {
        background: #eaf6ef;
        color: #145236;
        font-size: 13px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }
      .admin-pdf-table tr:last-child td {
        border-bottom: 0;
      }
    </style>
    <div class="admin-pdf-report">
      <header class="admin-pdf-header">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>Generated ${escapeHtml(generatedAt)}</p>
        </div>
        <strong>${rows.length} row${rows.length === 1 ? "" : "s"}</strong>
      </header>
      <table class="admin-pdf-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

async function renderAdminReportHtmlToCanvas(html, scale = 1.2) {
  const { default: html2canvas } = await import("html2canvas");
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.left = "0";
  wrapper.style.top = `${window.scrollY || 0}px`;
  wrapper.style.width = "1320px";
  wrapper.style.background = "#f8f7f4";
  wrapper.style.pointerEvents = "none";
  wrapper.style.zIndex = "2147483647";
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return await html2canvas(wrapper.firstElementChild, {
      backgroundColor: "#f8f7f4",
      scale,
      useCORS: true,
      logging: false,
      windowWidth: 1320,
      windowHeight: Math.ceil(wrapper.firstElementChild?.scrollHeight || wrapper.scrollHeight || 900),
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    wrapper.remove();
  }
}

function addCanvasPages(doc, canvas) {
  if (!canvas?.width || !canvas?.height) throw new Error("Unable to render report content.");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const sliceHeight = Math.floor(canvas.width * (pageHeight / pageWidth));
  const pageCanvas = document.createElement("canvas");
  const ctx = pageCanvas.getContext("2d");
  if (!ctx) throw new Error("Unable to prepare report page.");
  pageCanvas.width = canvas.width;

  let page = 0;
  for (let sourceY = 0; sourceY < canvas.height; sourceY += sliceHeight) {
    const currentSliceHeight = Math.min(sliceHeight, canvas.height - sourceY);
    pageCanvas.height = currentSliceHeight;
    ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, sourceY, canvas.width, currentSliceHeight, 0, 0, pageCanvas.width, currentSliceHeight);
    if (page > 0) doc.addPage();
    const imageHeight = (currentSliceHeight / canvas.width) * pageWidth;
    doc.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, imageHeight, undefined, "FAST");
    page += 1;
  }
}

async function saveAdminReportPdf({ title, fileName, columns, rows }) {
  if (typeof HTMLCanvasElement !== "undefined") {
    const columnWeight = (label) => {
      if (/Test Name/i.test(label)) return 2.2;
      if (/Candidate|Contact/i.test(label)) return 1.5;
      if (/Attempted Date/i.test(label)) return 1.8;
      if (/Time Taken|Avg Time/i.test(label)) return 1.25;
      if (/Test No|Passed|Failed|Score|Result|%|Rate/i.test(label)) return 0.85;
      return 1;
    };
    await downloadCanvasTablePdf({
      title,
      subtitle: `Generated ${formatDateTime(new Date())}`,
      columns: columns.map((label, index) => ({ label, key: String(index), weight: columnWeight(label) })),
      rows: rows.map(row => Object.fromEntries(row.map((value, index) => [String(index), value]))),
      fileName,
    });
    return;
  }
  /* istanbul ignore next -- retained as a compatibility fallback for older browsers */
  const html = buildAdminReportHtml({ title, generatedAt: formatDateTime(new Date()), columns, rows });
  try {
    const canvas = await renderAdminReportHtmlToCanvas(html);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    addCanvasPages(doc, canvas);
    downloadPdfDocument(doc, fileName);
  } catch (renderError) {
    console.warn("High-resolution PDF rendering failed; retrying at a safer scale.", renderError);
    try {
      const canvas = await renderAdminReportHtmlToCanvas(html, 0.8);
      const retryDoc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      addCanvasPages(retryDoc, canvas);
      downloadPdfDocument(retryDoc, fileName);
      return;
    } catch (retryError) {
      console.warn("Canvas PDF retry failed; checking native fallback.", retryError);
      if (/[\u0900-\u097F]/.test(JSON.stringify(rows))) {
        throw new Error("Marathi text could not be rendered. Please refresh the page and try the download again.", { cause: retryError });
      }
    }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const reportFont = await addDevanagariFont(doc);
    doc.setFillColor(26, 61, 40);
    doc.rect(0, 0, 297, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(title, 14, 10);
    doc.setFontSize(8);
    doc.text(`Generated ${formatDateTime(new Date())}`, 14, 17);
    autoTable(doc, {
      startY: 30,
      head: [columns],
      body: rows,
      margin: { left: 10, right: 10 },
      styles: { font: reportFont, fontStyle: "normal", fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { font: "helvetica", fontStyle: "bold", fillColor: [26, 61, 40], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 247, 244] },
      didParseCell(data) {
        if (data.section === "body" && !/[\u0900-\u097F]/.test(String(data.cell.raw || ""))) {
          data.cell.styles.font = "helvetica";
        }
      },
    });
    downloadPdfDocument(doc, fileName);
  }
}

function matchesUserResult(result, user) {
  const tokens = [
    user.email,
    user.mobile,
    user.username,
    user.name,
  ].filter(Boolean).map(value => String(value).toLowerCase());
  const haystack = [
    result.CandidateEmail,
    result.userEmail,
    result.CandidateName,
    result.userName,
  ].filter(Boolean).join(" ").toLowerCase();
  return tokens.some(token => haystack.includes(token));
}

function resultSuiteId(result) {
  return String(result.suiteId?._id || result.suiteId || "");
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) : "-";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }) : "-";
}

function validTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function toDateTimeLocalValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getPresetDateRange(preset) {
  const end = new Date();
  const start = new Date(end);
  if (preset === "last-day") start.setDate(start.getDate() - 1);
  else if (preset === "last-week") start.setDate(start.getDate() - 7);
  else if (preset === "last-month") start.setMonth(start.getMonth() - 1);
  else if (preset === "three-months") start.setMonth(start.getMonth() - 3);
  else if (preset === "last-year") start.setFullYear(start.getFullYear() - 1);
  else return { from: "", to: "" };
  return { from: toDateTimeLocalValue(start), to: toDateTimeLocalValue(end) };
}

function resultTimeTakenSeconds(result) {
  if (result?.timeTakenSeconds === null || result?.timeTakenSeconds === undefined || result?.timeTakenSeconds === "") {
    if (!result?.startedAt || !result?.submittedAt) return null;
  }
  const explicit = Number(result?.timeTakenSeconds);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  if (result?.startedAt && result?.submittedAt) {
    const started = new Date(result.startedAt).getTime();
    const submitted = new Date(result.submittedAt).getTime();
    if (!Number.isNaN(started) && !Number.isNaN(submitted) && submitted >= started) {
      return Math.round((submitted - started) / 1000);
    }
  }
  return null;
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return "-";
  const rounded = Math.round(total);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const restMins = mins % 60;
    return `${hours}h ${restMins}m ${secs}s`;
  }
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function buildTestSummaryRows(results) {
  const grouped = new Map();
  results.forEach(result => {
    const key = resultSuiteId(result) || resultTestName(result);
    if (!grouped.has(key)) {
      grouped.set(key, {
        testName: resultTestName(result),
        candidateKeys: new Set(),
        passed: 0,
        failed: 0,
        attempts: [],
        durations: [],
        percentages: [],
      });
    }
    const item = grouped.get(key);
    item.testName = item.testName || resultTestName(result);
    item.candidateKeys.add(String(resultCandidateContact(result) || resultCandidateName(result)).toLowerCase());
    if (resultStatus(result) === "Pass") item.passed += 1;
    else item.failed += 1;
    if (result.submittedAt) item.attempts.push(new Date(result.submittedAt));
    const duration = resultTimeTakenSeconds(result);
    if (duration !== null) item.durations.push(duration);
    item.percentages.push(resultPct(result));
  });

  return [...grouped.values()]
    .map((item) => {
      const validAttempts = item.attempts.filter(date => !Number.isNaN(date.getTime()));
      const latestAttempt = validAttempts.length
        ? new Date(Math.max(...validAttempts.map(date => date.getTime())))
        : null;
      const firstAttempt = validAttempts.length
        ? new Date(Math.min(...validAttempts.map(date => date.getTime())))
        : null;
      const averageTime = item.durations.length
        ? Math.round(item.durations.reduce((sum, value) => sum + value, 0) / item.durations.length)
        : null;
      const totalAttempts = item.passed + item.failed;
      const passRate = totalAttempts > 0 ? Math.round((item.passed / totalAttempts) * 10000) / 100 : 0;
      const averageScore = item.percentages.length
        ? Math.round((item.percentages.reduce((sum, value) => sum + value, 0) / item.percentages.length) * 100) / 100
        : 0;
      return {
        testName: item.testName,
        usersAttempted: item.candidateKeys.size,
        passed: item.passed,
        failed: item.failed,
        totalAttempts,
        passRate,
        averageScore,
        firstAttempt,
        latestAttempt,
        averageTime,
      };
    })
    .sort((a, b) => (b.latestAttempt?.getTime() || 0) - (a.latestAttempt?.getTime() || 0));
}

function SuiteModal({ suite, onClose, onSave }) {
  const [name, setName] = useState(suite?.name || "");
  const [description, setDescription] = useState(suite?.description || "");
  const [status, setStatus] = useState(suite?.status || "draft");
  const [passingPercentage, setPassingPercentage] = useState(suite?.passingPercentage ?? 50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const passMark = Number(passingPercentage);
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
      setError("Passing percentage must be between 0 and 100");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const config = { headers: getAuthHeaders() };
      const payload = {
        name: name.trim(),
        description: description.trim(),
        status,
        passingPercentage: passMark,
      };
      const res = suite
        ? await axios.put(`${API}/api/test-suites/${suite._id}`, payload, config)
        : await axios.post(`${API}/api/test-suites`, payload, config);

      onSave(res.data, suite ? "edit" : "create");
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Server connection failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="suite-modal-backdrop">
      <div className="suite-modal" role="dialog" aria-modal="true" aria-labelledby="suite-modal-title">
        <h2 id="suite-modal-title">{suite ? "Edit Test Suite" : "New Test Suite"}</h2>
        {error && <p className="suite-modal-error">{error}</p>}

        <label>
          Name *
          <input placeholder="e.g. NGO संवाद कौशल मूल्यांकन" value={name} onChange={e => setName(e.target.value)} />
        </label>

        <label>
          Description
          <input placeholder="Short description" value={description} onChange={e => setDescription(e.target.value)} />
        </label>

        <label>
          Status
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </label>

        <label>
          Passing Criteria (%)
          <input
            type="number"
            min={0}
            max={100}
            value={passingPercentage}
            onChange={e => setPassingPercentage(e.target.value)}
          />
        </label>

        <div className="suite-modal-actions">
          <button type="button" className="admin-secondary-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-primary-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : suite ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteResultsModal({ suite, users, resultCount, loading, onClose, onDelete }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [userId, setUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [password, setPassword] = useState("");

  const filteredUsers = users.filter(item =>
    userLabel(item).toLowerCase().includes(userSearch.toLowerCase()) ||
    (item.project || "").toLowerCase().includes(userSearch.toLowerCase()) ||
    (item.designation || "").toLowerCase().includes(userSearch.toLowerCase())
  );
  const selectedUser = users.find(item => item._id === userId);

  const handleDelete = () => {
    onDelete({
      suiteId: suite._id,
      suiteName: suite.name,
      fromDate,
      toDate,
      userId,
      userLabel: selectedUser ? userLabel(selectedUser) : "",
      password,
    });
  };

  return (
    <div className="suite-modal-backdrop">
      <div className="suite-modal result-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-results-title">
        <h2 id="delete-results-title">Delete Results</h2>
        <p className="result-delete-note">
          Delete submitted results for <strong>{suite.name}</strong>. Leave filters empty to delete all results for this test suite.
        </p>

        <div className="result-delete-count">
          <strong>{resultCount}</strong>
          <span>result(s) currently loaded for this suite</span>
        </div>

        <div className="result-delete-grid">
          <label>
            From date
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </label>
          <label>
            To date
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </label>
        </div>

        <label>
          Search user
          <input
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            placeholder="Search by name, email, mobile, username..."
          />
        </label>

        <label>
          Specific user
          <select value={userId} onChange={e => setUserId(e.target.value)}>
            <option value="">All users</option>
            {filteredUsers.slice(0, 80).map(item => (
              <option key={item._id} value={item._id}>{userLabel(item)}</option>
            ))}
          </select>
        </label>

        <label>
          Admin password *
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password to confirm"
            autoComplete="current-password"
          />
        </label>

        <div className="suite-modal-actions">
          <button type="button" className="admin-secondary-btn" onClick={onClose} disabled={loading}>Cancel</button>
          <button type="button" className="admin-delete-btn result-delete-confirm" onClick={handleDelete} disabled={loading || !password}>
            {loading ? "Deleting..." : "Delete Results"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteSuiteModal({ suite, attemptedPeople, loading, onClose, onDelete }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const canDelete = password.trim() && confirmation.trim().toUpperCase() === "DELETE";

  return (
    <div className="suite-modal-backdrop">
      <div className="suite-modal suite-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-suite-title">
        <h2 id="delete-suite-title">Delete Test Suite</h2>
        <p className="suite-delete-note">
          You are deleting <strong>{suite.name}</strong>. The suite and all its questions will move to Trash.
        </p>

        <div className="suite-delete-summary">
          <div>
            <strong>{suite.questionCount ?? 0}</strong>
            <span>question(s)</span>
          </div>
          <div>
            <strong>{attemptedPeople}</strong>
            <span>people attempted</span>
          </div>
          <div>
            <strong>{suite.status === "active" ? "Active" : "Draft"}</strong>
            <span>current status</span>
          </div>
        </div>

        {attemptedPeople > 0 && (
          <p className="suite-delete-warning">
            This test has submitted attempts. Deleting the suite may hide it from active management until it is recovered from Trash.
          </p>
        )}

        <label>
          Admin password *
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </label>

        <label>
          Type DELETE to confirm *
          <input
            value={confirmation}
            onChange={e => setConfirmation(e.target.value)}
            placeholder="DELETE"
          />
        </label>

        <div className="suite-modal-actions">
          <button type="button" className="admin-secondary-btn" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            type="button"
            className="admin-delete-btn suite-delete-confirm"
            onClick={() => onDelete({ suiteId: suite._id, suiteName: suite.name, password })}
            disabled={loading || !canDelete}
          >
            {loading ? "Deleting..." : "Delete Suite"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const copy = adminDashboardCopy(i18n.resolvedLanguage || i18n.language);
  const [suites, setSuites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSuite, setEditingSuite] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [deletedSuites, setDeletedSuites] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashActionId, setTrashActionId] = useState(null);
  const [users, setUsers] = useState([]);
  const [reportResults, setReportResults] = useState([]);
  const [assignmentUserIds, setAssignmentUserIds] = useState([]);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentProject, setAssignmentProject] = useState("");
  const [assignmentDesignation, setAssignmentDesignation] = useState("");
  const [assignedSuiteIds, setAssignedSuiteIds] = useState([]);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [suiteSearch, setSuiteSearch] = useState("");
  const [suiteDatePreset, setSuiteDatePreset] = useState("");
  const [suiteDateFrom, setSuiteDateFrom] = useState("");
  const [suiteDateTo, setSuiteDateTo] = useState("");
  const [reportSpanPreset, setReportSpanPreset] = useState("last-week");
  const [reportSpanFrom, setReportSpanFrom] = useState(() => getPresetDateRange("last-week").from);
  const [reportSpanTo, setReportSpanTo] = useState(() => getPresetDateRange("last-week").to);
  const [reportUserId, setReportUserId] = useState("");
  const [activePanel, setActivePanel] = useState("dashboard");
  const [deleteResultsSuite, setDeleteResultsSuite] = useState(null);
  const [deletingResults, setDeletingResults] = useState(false);
  const [deleteSuite, setDeleteSuite] = useState(null);
  const [deletingSuite, setDeletingSuite] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);
  const canViewReports = canAdmin("canViewReports", user);
  const canViewTestReports = canAdmin("canViewTestReports", user);
  const canDownloadReports = canAdmin("canDownloadReports", user);
  const canOpenSuites = canAdmin("canViewSuites", user);
  const canManageSuites = canOpenSuites && canAdmin("canManageSuites", user);
  const canViewQuestions = canAdmin("canViewQuestions", user);
  const canAssignTests = canAdmin("canAssignTests", user);
  const canBulkMail = canAdmin("canBulkMail", user);
  const canViewUsers = canAdmin("canViewUsers", user);

  useEffect(() => {
    document.body.classList.add("admin-dashboard-page");
    return () => document.body.classList.remove("admin-dashboard-page");
  }, []);

  const fetchTrashedSuites = useCallback(async () => {
    if (!canManageSuites) return;
    setTrashLoading(true);
    try {
      const res = await axios.get(`${API}/api/test-suites/trash/list`, {
        headers: getAuthHeaders(),
      });
      setDeletedSuites(res.data);
    } catch (err) {
      console.error("Failed to fetch deleted test suites:", err);
    } finally {
      setTrashLoading(false);
    }
  }, [canManageSuites]);

  const fetchSuites = useCallback(async () => {
    if (!canOpenSuites) {
      setSuites([]);
      setLoading(false);
      return;
    }
    try {
      const res = await axios.get(`${API}/api/test-suites`, {
        headers: getAuthHeaders(),
      });
      setSuites(res.data);
    } catch (err) {
      console.error("Failed to fetch test suites:", err);
    } finally {
      setLoading(false);
    }
  }, [canOpenSuites]);

  useEffect(() => {
    fetchSuites();
  }, [fetchSuites]);

  useEffect(() => {
    fetchTrashedSuites();
  }, [fetchTrashedSuites]);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  const fetchAdminData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [usersRes, resultsRes] = await Promise.allSettled([
        (canViewUsers || canAssignTests || canViewReports || canViewTestReports)
          ? axios.get(`${API}/api/auth/users`, { headers })
          : Promise.resolve({ data: [] }),
        (canViewReports || canViewTestReports)
          ? axios.get(`${API}/api/results/all`, { headers })
          : Promise.resolve({ data: [] }),
      ]);
      setUsers(usersRes.status === "fulfilled" ? usersRes.value.data : []);
      setReportResults(resultsRes.status === "fulfilled" ? resultsRes.value.data : []);
      if (usersRes.status === "rejected") console.error("Failed to fetch users:", usersRes.reason);
      if (resultsRes.status === "rejected") console.error("Failed to fetch reports:", resultsRes.reason);
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
    }
  }, [canAssignTests, canViewReports, canViewTestReports, canViewUsers]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  const activeSuites = suites.filter(suite => suite.status === "active").length;
  const candidateUsers = users.filter(item => item.role === "candidate" && item.isActive !== false);
  const assignableUsers = users.filter(item => ["candidate", "admin"].includes(item.role) && item.isActive !== false);
  const selectedAssignmentUsers = assignableUsers.filter(item => assignmentUserIds.includes(item._id));
  const selectedReportUser = users.find(item => item._id === reportUserId);
  const assignmentProjectOptions = uniqueSortedValues(assignableUsers.map(item => item.project));
  const assignmentDesignationOptions = uniqueSortedValues(assignableUsers
    .filter(item => !assignmentProject || item.project === assignmentProject)
    .map(item => item.designation));
  const assignmentFilteredUsers = assignableUsers.filter(item => {
    const q = assignmentSearch.toLowerCase();
    const matchesSearch =
      userLabel(item).toLowerCase().includes(q) ||
      (item.role || "").toLowerCase().includes(q) ||
      (item.project || "").toLowerCase().includes(q) ||
      (item.designation || "").toLowerCase().includes(q);
    const matchesProject = !assignmentProject || item.project === assignmentProject;
    const matchesDesignation = !assignmentDesignation || item.designation === assignmentDesignation;
    return matchesSearch && matchesProject && matchesDesignation;
  });
  const reportFilteredUsers = useMemo(
    () => users.filter(item => userMatchesReportSearch(item, reportSearch)),
    [users, reportSearch]
  );
  const reportUserOptions = keepSelectedUserVisible(reportFilteredUsers, selectedReportUser).slice(0, 80);
  const selectedUserResults = selectedReportUser
    ? reportResults.filter(result => matchesUserResult(result, selectedReportUser))
    : [];
  const selectedUserPassed = selectedUserResults.filter(result => resultStatus(result) === "Pass").length;
  const selectedUserFailed = Math.max(0, selectedUserResults.length - selectedUserPassed);
  const selectedUserAverage = selectedUserResults.length > 0
    ? Math.round(selectedUserResults.reduce((sum, result) => sum + resultPct(result), 0) / selectedUserResults.length)
    : 0;
  const selectedUserLatest = selectedUserResults[0] || null;
  const testSummaryRows = useMemo(() => buildTestSummaryRows(reportResults), [reportResults]);
  const descriptiveTestRows = useMemo(() => reportResults.map((result, index) => ({
    index: index + 1,
    testName: resultTestName(result),
    candidate: resultCandidateName(result),
    contact: resultCandidateContact(result),
    attemptedAt: result.submittedAt,
    timeTakenSeconds: resultTimeTakenSeconds(result),
    score: `${result.score || 0}/${result.totalMarks || 0}`,
    percentage: `${resultPct(result)}%`,
    result: resultStatus(result),
  })), [reportResults]);
  const reportSpanFromTime = validTime(reportSpanFrom);
  const reportSpanToTime = validTime(reportSpanTo);
  const reportSpanResults = useMemo(() => reportResults.filter(result => {
    const attemptedTime = validTime(result.submittedAt);
    if (attemptedTime === null) return false;
    if (reportSpanFromTime !== null && attemptedTime < reportSpanFromTime) return false;
    if (reportSpanToTime !== null && attemptedTime > reportSpanToTime) return false;
    return true;
  }), [reportResults, reportSpanFromTime, reportSpanToTime]);
  const reportSpanSummaryRows = useMemo(() => buildTestSummaryRows(reportSpanResults), [reportSpanResults]);
  const reportSpanCandidates = useMemo(() => new Set(
    reportSpanResults.map(result => String(resultCandidateContact(result) || resultCandidateName(result) || result._id).toLowerCase())
  ).size, [reportSpanResults]);
  const reportSpanPassed = reportSpanResults.filter(result => resultStatus(result) === "Pass").length;
  const reportSpanFailed = Math.max(0, reportSpanResults.length - reportSpanPassed);
  const reportSpanAverage = reportSpanResults.length
    ? Math.round((reportSpanResults.reduce((sum, result) => sum + resultPct(result), 0) / reportSpanResults.length) * 100) / 100
    : 0;
  const reportSpanLabel = `${reportSpanFrom ? formatDateTime(reportSpanFrom) : "Beginning"} to ${reportSpanTo ? formatDateTime(reportSpanTo) : "Now"}`;
  const handleReportSpanPresetChange = (preset) => {
    setReportSpanPreset(preset);
    const range = getPresetDateRange(preset);
    setReportSpanFrom(range.from);
    setReportSpanTo(range.to);
  };
  const suiteFromTime = validTime(suiteDateFrom);
  const suiteToTime = validTime(suiteDateTo);
  const handleSuiteDatePresetChange = (preset) => {
    setSuiteDatePreset(preset);
    const range = getPresetDateRange(preset);
    setSuiteDateFrom(range.from);
    setSuiteDateTo(range.to);
  };
  const filteredSuites = suites.filter(suite => {
    const matchesText = [
      suite.name,
      suite.description,
      suite.status,
      suite.isPublic === false ? "private assigned" : "public",
      `${suite.questionCount ?? 0} questions`,
      formatDateTime(suite.createdAt),
    ].join(" ").toLowerCase().includes(suiteSearch.toLowerCase());
    if (!matchesText) return false;

    const uploadedTime = validTime(suite.createdAt);
    if (suiteFromTime !== null && (uploadedTime === null || uploadedTime < suiteFromTime)) return false;
    if (suiteToTime !== null && (uploadedTime === null || uploadedTime > suiteToTime)) return false;
    return true;
  });
  const suiteFiltersActive = Boolean(suiteSearch || suiteDateFrom || suiteDateTo);

  useEffect(() => {
    if (activePanel !== "reports") return;
    if (reportUserId && !users.some(item => item._id === reportUserId)) {
      setReportUserId("");
      return;
    }
    if (reportUserId && reportSearch.trim() && selectedReportUser && !userMatchesReportSearch(selectedReportUser, reportSearch)) {
      setReportUserId("");
      return;
    }
    if (!reportUserId && reportSearch.trim() && reportFilteredUsers.length === 1) {
      setReportUserId(reportFilteredUsers[0]._id);
    }
  }, [activePanel, reportFilteredUsers, reportSearch, reportUserId, selectedReportUser, users]);

  const suiteResultCount = (suiteId) =>
    reportResults.filter(result => resultSuiteId(result) === String(suiteId)).length;

  const suiteAttemptedUserCount = (suiteId) => {
    const suiteResults = reportResults.filter(result => resultSuiteId(result) === String(suiteId));
    return new Set(suiteResults.map(result =>
      String(resultCandidateContact(result) || resultCandidateName(result) || result._id).toLowerCase()
    )).size;
  };

  const handleModalSave = (suite, action) => {
    if (action === "create") {
      setSuites(prev => [{ ...suite, questionCount: 0 }, ...prev]);
    } else {
      setSuites(prev => prev.map(item => item._id === suite._id ? { ...item, ...suite } : item));
    }
    fetchSuites();
  };

  const handleDelete = async ({ suiteId, password }) => {
    if (!password) return;
    setDeletingSuite(true);
    try {
      await axios.delete(`${API}/api/test-suites/${suiteId}`, {
        headers: getAuthHeaders(),
        data: { password },
      });
      setSuites(prev => prev.filter(suite => suite._id !== suiteId));
      setDeleteSuite(null);
      await fetchTrashedSuites();
    } catch (err) {
      alert("Delete failed: " + (err.response?.data?.message || "Check your permissions."));
    } finally {
      setDeletingSuite(false);
    }
  };

  const handleRecoverSuite = async (suiteId, suiteName) => {
    if (!window.confirm(`Recover "${suiteName}"? It will be restored as a draft test suite.`)) return;
    setTrashActionId(suiteId);
    try {
      const res = await axios.put(
        `${API}/api/test-suites/${suiteId}/recover`,
        { status: "draft" },
        { headers: getAuthHeaders() }
      );
      setDeletedSuites(prev => prev.filter(suite => suite._id !== suiteId));
      setSuites(prev => [{ ...res.data, status: "draft" }, ...prev]);
      await fetchSuites();
    } catch (err) {
      alert(err.response?.data?.message || "Unable to recover test suite.");
    } finally {
      setTrashActionId(null);
    }
  };

  const handlePermanentDeleteSuite = async (suiteId, suiteName) => {
    const password = window.prompt(`Enter your admin password to permanently delete "${suiteName}":`);
    if (!password) return;
    const confirmation = `Permanently delete "${suiteName}" and all its questions?\n\nThis cannot be undone. Type DELETE to confirm.`;
    if (window.prompt(confirmation) !== "DELETE") return;
    setTrashActionId(suiteId);
    try {
      await axios.delete(`${API}/api/test-suites/${suiteId}/permanent`, {
        headers: getAuthHeaders(),
        data: { password },
      });
      setDeletedSuites(prev => prev.filter(suite => suite._id !== suiteId));
    } catch (err) {
      alert(err.response?.data?.message || "Unable to permanently delete test suite.");
    } finally {
      setTrashActionId(null);
    }
  };

  const handleDeleteSuiteResults = async ({ suiteId, suiteName, fromDate, toDate, userId, userLabel: selectedUserLabel, password }) => {
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      alert("From date cannot be after To date.");
      return;
    }
    if (!password) {
      alert("Enter your password to delete results.");
      return;
    }

    const filters = [
      fromDate ? `from ${formatDate(fromDate)}` : "",
      toDate ? `to ${formatDate(toDate)}` : "",
      selectedUserLabel ? `for ${selectedUserLabel}` : "",
    ].filter(Boolean).join(", ");
    const target = filters || "all dates and all users";
    const confirmation = `Delete results for "${suiteName}" (${target})?\n\nThis cannot be undone. Type DELETE to confirm.`;
    if (window.prompt(confirmation) !== "DELETE") return;

    setDeletingResults(true);
    try {
      const res = await axios.delete(`${API}/api/results/suite/${suiteId}`, {
        headers: getAuthHeaders(),
        data: { fromDate, toDate, userId, password },
      });
      alert(`${res.data?.deletedCount || 0} result(s) deleted.`);
      setDeleteResultsSuite(null);
      await fetchAdminData();
    } catch (err) {
      alert(err.response?.data?.message || "Unable to delete results.");
    } finally {
      setDeletingResults(false);
    }
  };

  const handleToggleStatus = async (suiteId, currentStatus, e) => {
    e.stopPropagation();
    setTogglingId(suiteId);
    try {
      const newStatus = currentStatus === "active" ? "draft" : "active";
      await axios.put(
        `${API}/api/test-suites/${suiteId}`,
        { status: newStatus },
        { headers: getAuthHeaders() }
      );
      setSuites(prev => prev.map(suite =>
        suite._id === suiteId ? { ...suite, status: newStatus } : suite
      ));
    } catch {
      alert("Failed to update status.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleCopyLink = (suiteId, e) => {
    e.stopPropagation();
    const url = new URL(
      registerPathForNext(`/test/${suiteId}`),
      window.location.origin,
    ).href;
    navigator.clipboard.writeText(url)
      .then(() => alert("Registration link copied. Candidates will register first, then continue to this test. Existing candidates can use the Login link."))
      .catch(() => alert(`Share this link: ${url}`));
  };

  const assignmentSuiteIdsForUser = (userId) =>
    suites
      .filter(suite => suite.isPublic === false && assignedUserIdsForSuite(suite).includes(userId))
      .map(suite => suite._id);

  const toggleAssignmentUser = (userId) => {
    setAssignmentUserIds(prev => {
      const next = prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId];
      if (next.length === 0) {
        setAssignedSuiteIds([]);
      } else if (next.length === 1) {
        setAssignedSuiteIds(assignmentSuiteIdsForUser(next[0]));
      }
      return next;
    });
  };

  const selectVisibleAssignmentUsers = () => {
    const next = assignmentFilteredUsers.map(item => item._id);
    setAssignmentUserIds(next);
    if (next.length === 1) {
      setAssignedSuiteIds(assignmentSuiteIdsForUser(next[0]));
    }
  };

  const clearAssignmentUsers = () => {
    setAssignmentUserIds([]);
    setAssignedSuiteIds([]);
  };

  const clearAssignmentFilters = () => {
    setAssignmentSearch("");
    setAssignmentProject("");
    setAssignmentDesignation("");
  };

  const toggleAssignedSuite = (suiteId) => {
    setAssignedSuiteIds(prev =>
      prev.includes(suiteId) ? prev.filter(id => id !== suiteId) : [...prev, suiteId]
    );
  };

  const saveUserSuiteAssignments = async () => {
    if (assignmentUserIds.length === 0) return alert("Select at least one user first.");
    if (assignedSuiteIds.length === 0 && !window.confirm(
      assignmentUserIds.length === 1
        ? "No private suites are selected. This will remove private suite assignments for this user. Continue?"
        : "No private suites are selected. This will not assign any tests to the selected users. Continue?"
    )) {
      return;
    }

    setAssignmentSaving(true);
    try {
      const responses = [];
      for (const userId of assignmentUserIds) {
        const suiteIds = assignmentUserIds.length === 1
          ? assignedSuiteIds
          : [...new Set([...assignmentSuiteIdsForUser(userId), ...assignedSuiteIds])];
        const res = await axios.put(
          `${API}/api/test-suites/assignments/user/${userId}`,
          { suiteIds },
          { headers: getAuthHeaders() }
        );
        responses.push(res.data);
      }
      const latestSuites = responses[responses.length - 1] || [];
      const updatedById = new Map(latestSuites.map(suite => [suite._id, suite]));
      setSuites(prev => prev.map(suite =>
        updatedById.has(suite._id)
          ? { ...suite, ...updatedById.get(suite._id), questionCount: suite.questionCount }
          : suite
      ));
      alert(
        assignmentUserIds.length === 1
          ? "Test suite assignments saved."
          : `Selected test suite(s) assigned to ${assignmentUserIds.length} users.`
      );
    } catch (err) {
      alert(err.response?.data?.message || "Unable to save test suite assignments.");
    } finally {
      setAssignmentSaving(false);
    }
  };

  const downloadTestSummaryExcel = () => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    if (testSummaryRows.length === 0) return alert("No submitted test reports found.");
    const rows = testSummaryRows.map((row, index) => ({
      "Test Number": index + 1,
      "Test Name": row.testName,
      "Total Users Attempted": row.usersAttempted,
      "Passed": row.passed,
      "Failed": row.failed,
      "Pass Rate (%)": `${row.passRate.toFixed(2)}%`,
      "Average Score (%)": `${row.averageScore.toFixed(2)}%`,
      "Total Attempts": row.totalAttempts,
      "First Attempted At": formatDateTime(row.firstAttempt),
      "Latest Attempted At": formatDateTime(row.latestAttempt),
      "Average Time Taken": formatDuration(row.averageTime),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(key => ({ wch: Math.max(18, key.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, "Summary Test Report");
    downloadExcelWorkbook(XLSX, wb, `summary_test_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadTestSummaryPDF = async () => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    if (testSummaryRows.length === 0) return alert("No submitted test reports found.");
    try {
      await saveAdminReportPdf({
        title: "Statistical Test Report",
        fileName: `summary_test_report_${new Date().toISOString().slice(0, 10)}.pdf`,
        columns: ["Test No.", "Test Name", "Users Attempted", "Passed", "Failed", "Pass Rate", "Avg Score", "Avg Time Taken"],
        rows: testSummaryRows.map((row, index) => [index + 1, row.testName, row.usersAttempted, row.passed, row.failed, `${row.passRate.toFixed(2)}%`, `${row.averageScore.toFixed(2)}%`, formatDuration(row.averageTime)]),
      });
    } catch (err) {
      console.error(err);
      alert(`Unable to download the Statistical PDF: ${err.message || "Unknown error"}`);
    }
  };

  const downloadDescriptiveTestExcel = () => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    if (descriptiveTestRows.length === 0) return alert("No submitted test reports found.");
    const rows = descriptiveTestRows.map(row => ({
      "Test Number": row.index,
      "Test Name": row.testName,
      "Candidate": row.candidate,
      "Contact": row.contact,
      "Attempted Date & Time": formatDateTime(row.attemptedAt),
      "Time Taken": formatDuration(row.timeTakenSeconds),
      "Score": row.score,
      "Percentage": row.percentage,
      "Result": row.result,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(key => ({ wch: Math.max(18, key.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, "Descriptive Test Report");
    downloadExcelWorkbook(XLSX, wb, `descriptive_test_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadDescriptiveTestPDF = async () => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    if (descriptiveTestRows.length === 0) return alert("No submitted test reports found.");
    try {
      await saveAdminReportPdf({
        title: "Descriptive Test Report",
        fileName: `descriptive_test_report_${new Date().toISOString().slice(0, 10)}.pdf`,
        columns: ["Test No.", "Test Name", "Candidate", "Contact", "Attempted Date & Time", "Time Taken", "Score", "%", "Result"],
        rows: descriptiveTestRows.map(row => [row.index, row.testName, row.candidate, row.contact, formatDateTime(row.attemptedAt), formatDuration(row.timeTakenSeconds), row.score, row.percentage, row.result]),
      });
    } catch (err) {
      console.error(err);
      alert(`Unable to download the Descriptive PDF: ${err.message || "Unknown error"}`);
    }
  };

  const downloadAttemptAnalysisExcel = () => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    if (reportSpanSummaryRows.length === 0) return alert("No attempts found in this time span.");
    const summaryRows = [{
      "Time Span": reportSpanLabel,
      "Total Attempts": reportSpanResults.length,
      "Tests Attempted": reportSpanSummaryRows.length,
      "Unique Users": reportSpanCandidates,
      "Passed": reportSpanPassed,
      "Failed": reportSpanFailed,
      "Average Score": `${reportSpanAverage}%`,
    }];
    const rows = reportSpanSummaryRows.map((row, index) => ({
      "Sr. No.": index + 1,
      "Test Name": row.testName,
      "Attempts": row.totalAttempts,
      "Users": row.usersAttempted,
      "Passed": row.passed,
      "Failed": row.failed,
      "Pass Rate (%)": `${row.passRate.toFixed(2)}%`,
      "Average Score (%)": `${row.averageScore.toFixed(2)}%`,
      "First Attempted At": formatDateTime(row.firstAttempt),
      "Latest Attempted At": formatDateTime(row.latestAttempt),
      "Average Time Taken": formatDuration(row.averageTime),
    }));
    const wb = XLSX.utils.book_new();
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    const detailWs = XLSX.utils.json_to_sheet(rows);
    summaryWs["!cols"] = Object.keys(summaryRows[0]).map(key => ({ wch: Math.max(16, key.length + 4) }));
    detailWs["!cols"] = Object.keys(rows[0]).map(key => ({ wch: Math.max(18, key.length + 4) }));
    XLSX.utils.book_append_sheet(wb, summaryWs, "Time Span Summary");
    XLSX.utils.book_append_sheet(wb, detailWs, "Attempt Analysis");
    downloadExcelWorkbook(XLSX, wb, `attempt_analysis_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadAttemptAnalysisPDF = async () => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    if (reportSpanSummaryRows.length === 0) return alert("No attempts found in this time span.");
    try {
      await downloadCanvasTablePdf({
        title: "Attempt Analysis by Time Span",
        subtitle: `${reportSpanLabel} | ${reportSpanResults.length} attempts | ${reportSpanCandidates} users | ${reportSpanPassed} passed | ${reportSpanFailed} failed | ${reportSpanAverage}% average`,
        columns: [
          { label: "Sr.", key: "index", weight: 0.55 },
          { label: "Test Name", key: "testName", weight: 2.8 },
          { label: "Attempts", key: "attempts", weight: 0.9 },
          { label: "Users", key: "users", weight: 0.8 },
          { label: "Passed", key: "passed", weight: 0.8 },
          { label: "Failed", key: "failed", weight: 0.8 },
          { label: "Pass Rate", key: "passRate", weight: 1 },
          { label: "Avg Score", key: "averageScore", weight: 1 },
          { label: "Avg Time", key: "averageTime", weight: 1.1 },
        ],
        rows: reportSpanSummaryRows.map((row, index) => ({
          index: index + 1,
          testName: row.testName,
          attempts: row.totalAttempts,
          users: row.usersAttempted,
          passed: row.passed,
          failed: row.failed,
          passRate: `${row.passRate.toFixed(2)}%`,
          averageScore: `${row.averageScore.toFixed(2)}%`,
          averageTime: formatDuration(row.averageTime),
        })),
        fileName: `attempt_analysis_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch (err) {
      console.error(err);
      alert(`Unable to download the Attempt Analysis PDF: ${err.message || "Unknown error"}`);
    }
  };

  const downloadPersonalExcel = () => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    if (!selectedReportUser) return alert("Select a user first.");
    if (selectedUserResults.length === 0) return alert("No reports found for this user.");

    const overviewRows = [{
      "Candidate": selectedReportUser.name || "-",
      "Contact": userContact(selectedReportUser) || "-",
      "Project/Department": selectedReportUser.project || "-",
      "Designation": selectedReportUser.designation || "-",
      "Total Reports": selectedUserResults.length,
      "Passed": selectedUserPassed,
      "Failed": selectedUserFailed,
      "Average Percentage": `${selectedUserAverage}%`,
      "Latest Test": selectedUserLatest ? resultTestName(selectedUserLatest) : "-",
      "Latest Submitted": formatDateTime(selectedUserLatest?.submittedAt),
    }];

    const rows = selectedUserResults.map(result => ({
      "Test Name": resultTestName(result),
      "Candidate": resultCandidateName(result, selectedReportUser),
      "Contact": resultCandidateContact(result, selectedReportUser),
      "Project/Department": resultProject(result, selectedReportUser),
      "Designation": resultDesignation(result, selectedReportUser),
      "Score": `${result.score || 0}/${result.totalMarks || 0}`,
      "Correct Answers": result.correctAnswers ?? "-",
      "Total Questions": result.totalQuestions ?? "-",
      "Percentage": `${resultPct(result)}%`,
      "Grade": resultGrade(result),
      "Result": resultStatus(result),
      "Time Taken": formatDuration(resultTimeTakenSeconds(result)),
      "Submitted At": formatDateTime(result.submittedAt),
    }));
    const categoryRows = selectedUserResults.flatMap(result =>
      categoryRowsForResult(result).map((category, categoryIndex) => ({
        "Test Name": resultTestName(result),
        "Submitted At": formatDateTime(result.submittedAt),
        "Category": categoryName(category, categoryIndex),
        "Score": `${category.score ?? category.earnedMarks ?? 0}/${category.total ?? 0}`,
        "Percentage": `${category.percentage || 0}%`,
        "Scale Score": category.scaleScore ? `${category.scaleScore}/10` : "-",
        "Grade": categoryLabel(category),
        "Description": category.description || "-",
      }))
    );
    const questionRows = selectedUserResults.flatMap(result =>
      questionReviewRows(result).map(row => ({
        "Test Name": resultTestName(result),
        "Submitted At": formatDateTime(result.submittedAt),
        "Question No.": row.number,
        "Question": row.question,
        "Category": row.categories,
        "Selected Answer": row.selected,
        "Correct Answer": row.correct,
        "Review": row.review,
        "Marks": row.marks,
      }))
    );
    const wb = XLSX.utils.book_new();
    const overviewWs = XLSX.utils.json_to_sheet(overviewRows);
    const ws = XLSX.utils.json_to_sheet(rows);
    const categoryWs = XLSX.utils.json_to_sheet(categoryRows.length > 0 ? categoryRows : [{ "Category": "No category breakdown available" }]);
    const questionWs = XLSX.utils.json_to_sheet(questionRows.length > 0 ? questionRows : [{ "Question": "No question-wise answer data available" }]);
    overviewWs["!cols"] = Object.keys(overviewRows[0]).map(key => ({ wch: Math.max(18, key.length + 4) }));
    ws["!cols"] = Object.keys(rows[0]).map(key => ({ wch: Math.max(16, key.length + 4) }));
    categoryWs["!cols"] = categoryRows.length > 0
      ? Object.keys(categoryRows[0]).map(key => ({ wch: Math.max(18, key.length + 4) }))
      : [{ wch: 34 }];
    questionWs["!cols"] = questionRows.length > 0
      ? Object.keys(questionRows[0]).map(key => ({ wch: key === "Question" || key.includes("Answer") ? 42 : 20 }))
      : [{ wch: 42 }];
    XLSX.utils.book_append_sheet(wb, overviewWs, "Overview");
    XLSX.utils.book_append_sheet(wb, ws, "Test Attempts");
    XLSX.utils.book_append_sheet(wb, categoryWs, "Category Details");
    XLSX.utils.book_append_sheet(wb, questionWs, "Question Details");
    downloadExcelWorkbook(XLSX, wb, `personal_report_${fileSafeName(selectedReportUser.name)}.xlsx`);
  };

  const downloadPersonalPDF = async () => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    if (!selectedReportUser) return alert("Select a user first.");
    if (selectedUserResults.length === 0) return alert("No reports found for this user.");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const reportFont = await addDevanagariFont(doc);
    const pdfFontFor = (value) => /[\u0900-\u097F]/.test(String(value || "")) ? reportFont : "helvetica";
    const applyPersonalPdfFont = (data) => {
      if (data.section !== "body") return;
      const raw = data.cell?.raw;
      data.cell.styles.font = pdfFontFor(raw);
    };
    doc.setFillColor(26, 61, 40);
    doc.rect(0, 0, 297, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Snehalaya Personal Test Report", 14, 10);
    doc.setFontSize(9);
    const headerCandidateLine = `${selectedReportUser.name || "Selected user"}  |  ${userContact(selectedReportUser) || "-"}`;
    doc.setFont(pdfFontFor(headerCandidateLine), "normal");
    doc.text(headerCandidateLine, 14, 17);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleDateString("en-IN"), 283, 15, { align: "right" });

    doc.setTextColor(26, 61, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Candidate Summary", 14, 34);

    autoTable(doc, {
      startY: 38,
      head: [["Candidate", "Contact", "Project/Department", "Designation", "Reports", "Passed", "Failed", "Average", "Latest Test", "Latest Submitted"]],
      body: [[
        selectedReportUser.name || "-",
        userContact(selectedReportUser) || "-",
        selectedReportUser.project || "-",
        selectedReportUser.designation || "-",
        selectedUserResults.length,
        selectedUserPassed,
        selectedUserFailed,
        `${selectedUserAverage}%`,
        selectedUserLatest ? resultTestName(selectedUserLatest) : "-",
        formatDateTime(selectedUserLatest?.submittedAt),
      ]],
      styles: { fontSize: 7.2, cellPadding: 2, overflow: "linebreak", font: reportFont, fontStyle: "normal" },
      headStyles: { fillColor: [231, 244, 235], textColor: [26, 61, 40] },
      bodyStyles: { textColor: [36, 48, 40], font: reportFont, fontStyle: "normal" },
      didParseCell: applyPersonalPdfFont,
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 40 },
        2: { cellWidth: 38 },
        3: { cellWidth: 30 },
        8: { cellWidth: 42 },
        9: { cellWidth: 30 },
      },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["#", "Test Name", "Candidate", "Contact", "Project/Department", "Designation", "Score", "Correct/Total", "%", "Grade", "Result", "Time Taken", "Attempted At", "Category Breakdown"]],
      body: selectedUserResults.map((result, index) => [
        index + 1,
        resultTestName(result),
        resultCandidateName(result, selectedReportUser),
        resultCandidateContact(result, selectedReportUser),
        resultProject(result, selectedReportUser),
        resultDesignation(result, selectedReportUser),
        `${result.score || 0}/${result.totalMarks || 0}`,
        `${result.correctAnswers ?? "-"}/${result.totalQuestions ?? "-"}`,
        `${resultPct(result)}%`,
        resultGrade(result),
        resultStatus(result),
        formatDuration(resultTimeTakenSeconds(result)),
        formatDateTime(result.submittedAt),
        categoryRowsForResult(result).length > 0
          ? categoryRowsForResult(result)
            .map((category, categoryIndex) => `${categoryName(category, categoryIndex)}: ${category.score ?? category.earnedMarks ?? 0}/${category.total ?? 0}, ${category.percentage || 0}% (${categoryLabel(category)}${category.scaleScore ? `, ${category.scaleScore}/10` : ""})`)
            .join("\n")
          : "-",
      ]),
      styles: { fontSize: 5.8, cellPadding: 1.2, overflow: "linebreak", font: reportFont, fontStyle: "normal" },
      headStyles: { fillColor: [26, 61, 40], textColor: [255, 255, 255], font: "helvetica", fontStyle: "bold" },
      bodyStyles: { font: reportFont, fontStyle: "normal" },
      alternateRowStyles: { fillColor: [248, 247, 244] },
      didParseCell: applyPersonalPdfFont,
      columnStyles: {
        0: { cellWidth: 7, halign: "center" },
        1: { cellWidth: 30 },
        2: { cellWidth: 22 },
        3: { cellWidth: 28 },
        4: { cellWidth: 24 },
        5: { cellWidth: 20 },
        6: { cellWidth: 16 },
        7: { cellWidth: 16 },
        8: { cellWidth: 12 },
        9: { cellWidth: 14 },
        10: { cellWidth: 14 },
        11: { cellWidth: 18 },
        12: { cellWidth: 22 },
        13: { cellWidth: 26 },
      },
    });

    let reviewY = doc.lastAutoTable.finalY + 10;
    selectedUserResults.forEach((result, resultIndex) => {
      const rows = questionReviewRows(result);
      const categories = categoryRowsForResult(result);
      if (reviewY > 178) {
        doc.addPage();
        reviewY = 18;
      }

      doc.setTextColor(26, 61, 40);
      const reviewTitle = `Question Review ${resultIndex + 1}: ${resultTestName(result)}`;
      doc.setFont(pdfFontFor(reviewTitle), "normal");
      doc.setFontSize(10);
      doc.text(reviewTitle, 14, reviewY);
      const reviewMeta = `Candidate: ${resultCandidateName(result, selectedReportUser)} | Contact: ${resultCandidateContact(result, selectedReportUser)} | Project: ${resultProject(result, selectedReportUser)} | Designation: ${resultDesignation(result, selectedReportUser)}`;
      doc.setFont(pdfFontFor(reviewMeta), "normal");
      doc.setFontSize(8);
      doc.setTextColor(90, 95, 92);
      doc.text(reviewMeta, 14, reviewY + 5, { maxWidth: 269 });
      const attemptMeta = `Attempted: ${formatDateTime(result.submittedAt)} | Time: ${formatDuration(resultTimeTakenSeconds(result))} | Score: ${result.score || 0}/${result.totalMarks || 0} | Result: ${resultStatus(result)}`;
      doc.setFont(pdfFontFor(attemptMeta), "normal");
      doc.text(
        attemptMeta,
        14,
        reviewY + 10
      );

      if (categories.length > 0) {
        autoTable(doc, {
          startY: reviewY + 15,
          head: [["Category", "Score", "%", "Level", "Scale", "Description"]],
          body: categories.map((category, categoryIndex) => [
            categoryName(category, categoryIndex),
            `${category.score ?? category.earnedMarks ?? 0}/${category.total ?? 0}`,
            `${category.percentage || 0}%`,
            categoryLabel(category),
            category.scaleScore ? `${category.scaleScore}/10` : "-",
            category.description || "-",
          ]),
          theme: "grid",
          margin: { left: 14, right: 14 },
          tableWidth: 269,
          styles: { fontSize: 7, cellPadding: 1.7, overflow: "linebreak", valign: "top", font: reportFont, fontStyle: "normal" },
          headStyles: { fillColor: [231, 244, 235], textColor: [26, 61, 40], font: "helvetica", fontStyle: "bold" },
          bodyStyles: { font: reportFont, fontStyle: "normal", textColor: [36, 48, 40] },
          didParseCell: applyPersonalPdfFont,
          columnStyles: {
            0: { cellWidth: 42 },
            1: { cellWidth: 24 },
            2: { cellWidth: 20 },
            3: { cellWidth: 28 },
            4: { cellWidth: 20 },
            5: { cellWidth: 135 },
          },
        });
        reviewY = doc.lastAutoTable.finalY + 6;
      }

      if (rows.length === 0) {
        doc.setTextColor(120, 120, 112);
        doc.text("No question-wise answer data is available for this attempt.", 14, reviewY + 8);
        reviewY += 22;
        return;
      }

      reviewY += categories.length > 0 ? 0 : 15;
      rows.forEach(row => {
        if (reviewY > 184) {
          doc.addPage();
          reviewY = 18;
        }

        autoTable(doc, {
          startY: reviewY,
          head: [["Q.No.", "Field", "Details"]],
          body: [
            [row.number, "Question", row.question || "-"],
            ["", "Category", row.categories || "-"],
            ["", "Selected Option", row.selected || "-"],
            ["", "Correct Option", row.correct || "-"],
            ["", "Review", row.review || "-"],
            ["", "Marks", row.marks || "-"],
          ],
          theme: "grid",
          margin: { left: 14, right: 14 },
          tableWidth: 269,
          rowPageBreak: "avoid",
          styles: { fontSize: 7.2, cellPadding: 1.8, overflow: "linebreak", valign: "top", font: reportFont, fontStyle: "normal" },
          headStyles: { fillColor: [231, 244, 235], textColor: [26, 61, 40], font: "helvetica", fontStyle: "bold" },
          bodyStyles: { font: reportFont, fontStyle: "normal", textColor: [36, 48, 40] },
          alternateRowStyles: { fillColor: [248, 247, 244] },
          columnStyles: {
            0: { cellWidth: 14, halign: "center" },
            1: { cellWidth: 34, font: "helvetica", fontStyle: "bold", textColor: [26, 61, 40], fillColor: [231, 244, 235] },
            2: { cellWidth: 221 },
          },
          didParseCell: (data) => {
            applyPersonalPdfFont(data);
            if (
              data.section === "body" &&
              data.column.index === 2 &&
              String(data.row.raw?.[1] || "").toLowerCase() === "review"
            ) {
              const value = String(data.cell.raw || "").toLowerCase();
              if (value === "correct") data.cell.styles.textColor = [22, 101, 52];
              if (value === "incorrect") data.cell.styles.textColor = [185, 28, 28];
            }
          },
        });
        reviewY = doc.lastAutoTable.finalY + 4;
      });
      reviewY += 6;
    });

    downloadPdfDocument(doc, `personal_report_${fileSafeName(selectedReportUser.name)}.pdf`);
  };

  const openNewSuite = () => {
    setEditingSuite(null);
    setShowModal(true);
  };

  const showAllSuites = () => {
    setActivePanel("dashboard");
    requestAnimationFrame(() => {
      document.getElementById("admin-test-suites")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openBulkMail = () => {
    setActivePanel("bulk-mail");
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <div className="admin-dashboard-shell">
      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-brand">
            <img src="/Logo.png" alt="Snehalaya logo" />
            <div>
              <h1>Snehalaya</h1>
              <span>{copy.platform}</span>
            </div>
          </div>

          <div className="admin-welcome">
            <h2>{copy.welcomeBack} <span>🌱</span></h2>
            <p>{copy.welcomeText}</p>
          </div>

          <div className="admin-top-actions">
            <LanguageSwitcher className="admin-language-switcher" />
            <div className="admin-date-card">
              <div className="admin-date-icon">◷</div>
              <div className="admin-date-copy">
                <span>{copy.today}</span>
                <strong>{now.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}</strong>
                <em>{now.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                })}</em>
              </div>
            </div>
            <div className="admin-profile-card">
              <div>{(user.name || "Admin").charAt(0).toUpperCase()}</div>
              <p>
                <strong>{user.name || "Admin"}</strong>
                <span>{copy.administrator}</span>
              </p>
            </div>
            <button type="button" className="admin-logout-btn" onClick={logout}>
              ⇥ {copy.logout}
            </button>
          </div>
        </header>

        <nav className="admin-top-nav">
          <button type="button" className={activePanel === "dashboard" ? "active" : ""} onClick={showAllSuites}>
            ⌂ {copy.dashboard}
          </button>

          <div className="admin-nav-menu">
            <button type="button">▤ {copy.testManagement}⌄</button>
            <div className="admin-nav-dropdown">
              <button type="button" onClick={showAllSuites} disabled={!canOpenSuites}>▤ {copy.allTestSuites}</button>
              <button type="button" onClick={openNewSuite} disabled={!canManageSuites}>＋ {copy.addTestSuite}</button>
              {canAssignTests && (
                <button type="button" onClick={() => setActivePanel("assignments")}>
                  ♙ {copy.assignTestSuites}
                </button>
              )}
            </div>
          </div>

          {canViewReports && (
            <div className="admin-nav-menu">
              <button type="button">▥ {copy.results}⌄</button>
              <div className="admin-nav-dropdown">
                <button type="button" onClick={() => navigate("/view-results")}>☰ {copy.allTestResults}</button>
                <button type="button" onClick={() => setActivePanel("reports")}>
                  ▧ {copy.userPersonalReports}
                </button>
              </div>
            </div>
          )}

          {canBulkMail && (
            <button type="button" className={activePanel === "bulk-mail" ? "active" : ""} onClick={openBulkMail}>
              ✉ {copy.bulkMail}
            </button>
          )}

          {canViewTestReports && (
            <button type="button" className={activePanel === "test-report" ? "active" : ""} onClick={() => setActivePanel("test-report")}>
              ▥ {copy.testReport}
            </button>
          )}

          {canManageSuites && (
            <button type="button" className={activePanel === "trash" ? "active" : ""} onClick={() => { setActivePanel("trash"); fetchTrashedSuites(); }}>
              ⌫ {copy.trash}
              {deletedSuites.length > 0 && <span className="admin-nav-count">{deletedSuites.length}</span>}
            </button>
          )}
        </nav>

        <section className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-icon">▣</div>
            <div>
              <p>{copy.testSuites}</p>
              <strong>{suites.length}</strong>
              <span>{copy.totalSuites}</span>
            </div>
            <div className="admin-progress"><span style={{ width: `${Math.min(100, Math.max(22, suites.length * 16))}%` }} /></div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon">⌁</div>
            <div>
              <p>{copy.activeSuites}</p>
              <strong>{activeSuites}</strong>
              <span>{copy.liveRightNow}</span>
            </div>
            <div className="admin-progress"><span style={{ width: `${suites.length ? Math.max(22, (activeSuites / suites.length) * 100) : 0}%` }} /></div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon">♙</div>
            <div>
              <p>{copy.totalCandidates}</p>
              <strong>{candidateUsers.length}</strong>
              <span>{copy.registeredCandidates}</span>
            </div>
            <div className="admin-progress"><span style={{ width: `${Math.min(100, Math.max(18, candidateUsers.length * 3))}%` }} /></div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon">▧</div>
            <div>
              <p>{copy.totalResponses}</p>
              <strong>{reportResults.length}</strong>
              <span>{copy.submittedTests}</span>
            </div>
            <div className="admin-progress"><span style={{ width: `${Math.min(100, Math.max(18, reportResults.length * 4))}%` }} /></div>
          </div>
        </section>

        {activePanel === "assignments" && canAssignTests && (
          <section className="admin-management-grid single">
          <div className="admin-management-card">
            <div className="admin-panel-heading">
              <h3>Assign Test Suites</h3>
              <p>Select one or more users, then assign private test suites to the selected users.</p>
            </div>

            <input
              value={assignmentSearch}
              onChange={(e) => setAssignmentSearch(e.target.value)}
              placeholder="Search user by name, contact, role, project..."
            />

            <div className="assignment-scope-grid">
              <label>
                <span>Project / Department</span>
                <select
                  value={assignmentProject}
                  onChange={(e) => {
                    setAssignmentProject(e.target.value);
                    setAssignmentDesignation("");
                  }}
                >
                  <option value="">All project/departments</option>
                  {assignmentProjectOptions.map(project => (
                    <option key={project} value={project}>{project}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Designation</span>
                <select
                  value={assignmentDesignation}
                  onChange={(e) => setAssignmentDesignation(e.target.value)}
                >
                  <option value="">All designations</option>
                  {assignmentDesignationOptions.map(designation => (
                    <option key={designation} value={designation}>{designation}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={selectVisibleAssignmentUsers}
                disabled={assignmentFilteredUsers.length === 0}
              >
                Select Matching
              </button>
              <button
                type="button"
                className="secondary"
                onClick={clearAssignmentFilters}
                disabled={!assignmentSearch && !assignmentProject && !assignmentDesignation}
              >
                Clear Filters
              </button>
            </div>

            <div className="admin-panel-footer">
              <span>{assignmentUserIds.length} user(s) selected · {assignmentFilteredUsers.length} matching</span>
              <div>
                <button type="button" onClick={selectVisibleAssignmentUsers} disabled={assignmentFilteredUsers.length === 0}>
                  Select Matching
                </button>
                <button type="button" onClick={clearAssignmentUsers} disabled={assignmentUserIds.length === 0}>
                  Clear Users
                </button>
              </div>
            </div>

            <div className="admin-user-pick-list">
              {assignmentFilteredUsers.slice(0, 80).map(candidate => {
                const selected = assignmentUserIds.includes(candidate._id);
                return (
                  <label key={candidate._id} className={selected ? "selected" : ""}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleAssignmentUser(candidate._id)}
                    />
                    <span>
                      <strong>{userLabel(candidate)}</strong>
                      <small>{candidate.role === "admin" ? "Admin" : "Candidate"} · {candidate.project || "No project"} · {candidate.designation || "No designation"}</small>
                    </span>
                  </label>
                );
              })}
              {assignmentFilteredUsers.length === 0 && <p>No matching users found.</p>}
            </div>

            <div className="admin-suite-pick-list">
              {suites.map(suite => {
                const selected = assignedSuiteIds.includes(suite._id);
                const publicSuite = suite.isPublic !== false;
                return (
                  <label key={suite._id} className={selected ? "selected" : ""}>
                    <input
                      type="checkbox"
                      disabled={assignmentUserIds.length === 0}
                      checked={selected}
                      onChange={() => toggleAssignedSuite(suite._id)}
                    />
                    <span>
                      <strong>{suite.name}</strong>
                      <small>
                        {suite.questionCount ?? 0} questions · {publicSuite ? "Public now" : `${assignedUserIdsForSuite(suite).length} assigned`}
                      </small>
                    </span>
                  </label>
                );
              })}
              {suites.length === 0 && <p>No test suites available.</p>}
            </div>

            <div className="admin-panel-footer">
              <span>
                {selectedAssignmentUsers.length
                  ? `${assignedSuiteIds.length} suite(s) selected for ${selectedAssignmentUsers.length} user(s)`
                  : "Choose at least one user"}
              </span>
              <button type="button" onClick={saveUserSuiteAssignments} disabled={assignmentSaving}>
                {assignmentSaving ? "Saving..." : "Save Assignment"}
              </button>
            </div>
          </div>
          </section>
        )}

        {activePanel === "reports" && canViewReports && (
          <section className="admin-management-grid single">
          <div className="admin-management-card">
            <div className="admin-panel-heading">
              <h3>User Personal Reports</h3>
              <p>Search a user and download only their submitted test reports.</p>
            </div>

            <input
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              placeholder="Search user by name, username, mobile, email..."
            />
            <select value={reportUserId} onChange={(e) => setReportUserId(e.target.value)}>
              <option value="">Select user</option>
              {reportUserOptions.map(item => (
                <option key={item._id} value={item._id}>{userLabel(item)}</option>
              ))}
            </select>

            <div className="admin-report-summary">
              <strong>{selectedUserResults.length}</strong>
              <span>report(s) found</span>
            </div>

            {selectedReportUser ? (
              <div className="admin-personal-report">
                <div className="admin-personal-profile">
                  <div>
                    <strong>{selectedReportUser.name || "Selected user"}</strong>
                    <span>{userContact(selectedReportUser) || "No contact available"}</span>
                  </div>
                  <div>
                    <span>Project/Department</span>
                    <strong>{selectedReportUser.project || "-"}</strong>
                  </div>
                  <div>
                    <span>Designation</span>
                    <strong>{selectedReportUser.designation || "-"}</strong>
                  </div>
                </div>

                <div className="admin-personal-stats">
                  <div><strong>{selectedUserPassed}</strong><span>Passed</span></div>
                  <div><strong>{selectedUserFailed}</strong><span>Failed</span></div>
                  <div><strong>{selectedUserAverage}%</strong><span>Average</span></div>
                  <div><strong>{selectedUserLatest ? formatDateTime(selectedUserLatest.submittedAt) : "-"}</strong><span>Latest</span></div>
                </div>

                <div className="admin-personal-attempts">
                  {selectedUserResults.length > 0 ? selectedUserResults.map(result => (
                    <article key={result._id} className="admin-personal-attempt">
                      <div className="admin-personal-attempt-head">
                        <div>
                          <h4>{resultTestName(result)}</h4>
                          <p>{formatDateTime(result.submittedAt)}</p>
                        </div>
                        <div className={`admin-personal-status ${resultStatus(result).toLowerCase()}`}>
                          {resultStatus(result)}
                        </div>
                      </div>
                      <div className="admin-personal-score">
                        <strong>{result.score || 0}/{result.totalMarks || 0}</strong>
                        <span>{resultPct(result)}% · {resultGrade(result)}</span>
                        <small>{result.correctAnswers ?? 0} correct of {result.totalQuestions ?? 0} questions</small>
                      </div>
                      {categoryRowsForResult(result).length > 0 && (
                        <div className="admin-personal-categories">
                          {categoryRowsForResult(result).map((category, categoryIndex) => (
                            <div key={`${result._id}-${categoryName(category, categoryIndex)}`} className="admin-personal-category">
                              <div>
                                <span>{categoryName(category, categoryIndex)}</span>
                                <strong>{categoryLabel(category)} · {categoryScoreLabel(category)}</strong>
                              </div>
                              <div className="admin-personal-bar">
                                <span style={{ width: `${Math.max(0, Math.min(100, category.percentage || 0))}%` }} />
                              </div>
                              <small>{category.score ?? category.earnedMarks ?? 0}/{category.total ?? 0}</small>
                              {category.description && <small>{category.description}</small>}
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  )) : (
                    <p className="admin-personal-empty">No submitted tests found for this user.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="admin-personal-empty">Select a user to view detailed personal reports.</p>
            )}

            <div className="admin-report-actions">
              {canDownloadReports ? (
                <>
                  <button type="button" onClick={downloadPersonalPDF}>Descriptive PDF</button>
                  <button type="button" onClick={downloadPersonalExcel}>Download Excel</button>
                </>
              ) : (
                <span>Download disabled</span>
              )}
            </div>
          </div>
          </section>
        )}

        {activePanel === "bulk-mail" && canBulkMail && (
          <section className="admin-bulk-mail">
            <BulkMailPanel compact />
          </section>
        )}

        {activePanel === "test-report" && canViewTestReports && (
          <section className="admin-test-report">
            <div className="admin-test-report-titlebar">
              <div>
                <h3>Test Report</h3>
                <p>Download statistical summary and descriptive reports for all submitted test attempts.</p>
              </div>
            </div>

            <div className="admin-report-span-panel">
              <div className="admin-report-span-head">
                <div>
                  <h4>Attempt analysis by time span</h4>
                  <p>{reportSpanLabel}</p>
                </div>
                <div className="admin-report-span-filters">
                  <select value={reportSpanPreset} onChange={(e) => handleReportSpanPresetChange(e.target.value)}>
                    <option value="">Custom</option>
                    <option value="last-day">Last 24 hours</option>
                    <option value="last-week">Last 7 days</option>
                    <option value="last-month">Last month</option>
                    <option value="three-months">Last 3 months</option>
                    <option value="last-year">Last year</option>
                  </select>
                  <input type="datetime-local" value={reportSpanFrom} onChange={(e) => { setReportSpanPreset(""); setReportSpanFrom(e.target.value); }} />
                  <input type="datetime-local" value={reportSpanTo} onChange={(e) => { setReportSpanPreset(""); setReportSpanTo(e.target.value); }} />
                  <button type="button" onClick={downloadAttemptAnalysisPDF} disabled={!canDownloadReports || reportSpanSummaryRows.length === 0}>
                    PDF
                  </button>
                  <button type="button" onClick={downloadAttemptAnalysisExcel} disabled={!canDownloadReports || reportSpanSummaryRows.length === 0}>
                    Excel
                  </button>
                </div>
              </div>
              <div className="admin-report-span-stats">
                <div><strong>{reportSpanResults.length}</strong><span>Total attempts</span></div>
                <div><strong>{reportSpanSummaryRows.length}</strong><span>Tests attempted</span></div>
                <div><strong>{reportSpanCandidates}</strong><span>Unique users</span></div>
                <div><strong>{reportSpanPassed}</strong><span>Passed</span></div>
                <div><strong>{reportSpanFailed}</strong><span>Failed</span></div>
                <div><strong>{reportSpanAverage}%</strong><span>Average score</span></div>
              </div>
              <div className="admin-table-scroll">
                <table className="admin-span-table">
                  <thead>
                    <tr>
                      <th>Test Name</th>
                      <th>Attempts</th>
                      <th>Users</th>
                      <th>Passed</th>
                      <th>Failed</th>
                      <th>Pass Rate</th>
                      <th>Average Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportSpanSummaryRows.map((row, index) => (
                      <tr key={`${row.testName}-span-${index}`}>
                        <td>{row.testName}</td>
                        <td>{row.totalAttempts}</td>
                        <td>{row.usersAttempted}</td>
                        <td><span className="report-good">{row.passed}</span></td>
                        <td><span className="report-bad">{row.failed}</span></td>
                        <td>{row.passRate.toFixed(2)}%</td>
                        <td>{row.averageScore.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reportSpanSummaryRows.length === 0 && <p className="admin-personal-empty">No attempts found in this time span.</p>}
              </div>
            </div>

            <div className="admin-test-report-grid">
              <article className="admin-test-report-card">
                <div className="admin-test-report-icon">▥</div>
                <div className="admin-test-report-copy">
                  <h4>Statistical Test Report</h4>
                  <p>Test number, users attempted, passed, failed, pass rate, average score, and average time taken</p>
                </div>
                <div className="admin-report-actions inline">
                  <button type="button" onClick={downloadTestSummaryPDF} disabled={!canDownloadReports || testSummaryRows.length === 0}>▤ Statistical PDF</button>
                  <button type="button" onClick={downloadTestSummaryExcel} disabled={!canDownloadReports || testSummaryRows.length === 0}>▣ Statistical Excel</button>
                </div>
              </article>

              <article className="admin-test-report-card">
                <div className="admin-test-report-icon pie">◔</div>
                <div className="admin-test-report-copy">
                  <h4>Descriptive Test Report</h4>
                  <p>Candidate-wise attempt date and time, time taken, score, percentage, and pass/fail result</p>
                </div>
                <div className="admin-report-actions inline">
                  <button type="button" onClick={downloadDescriptiveTestPDF} disabled={!canDownloadReports || descriptiveTestRows.length === 0}>▤ Descriptive PDF</button>
                  <button type="button" onClick={downloadDescriptiveTestExcel} disabled={!canDownloadReports || descriptiveTestRows.length === 0}>▣ Descriptive Excel</button>
                </div>
              </article>
            </div>

            <div className="admin-test-report-table">
              <div className="admin-test-report-table-head">
                <h4>Statistical Summary</h4>
                <span>{testSummaryRows.length} test(s)</span>
              </div>
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Test No.</th>
                      <th>Test Name</th>
                      <th>Users Attempted</th>
                      <th>Passed</th>
                      <th>Failed</th>
                      <th>Pass Rate (%)</th>
                      <th>Average Score (%)</th>
                      <th>Average Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testSummaryRows.slice(0, 12).map((row, index) => (
                      <tr key={`${row.testName}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{row.testName}</td>
                        <td>{row.usersAttempted}</td>
                        <td><span className="report-good">{row.passed}</span></td>
                        <td><span className="report-bad">{row.failed}</span></td>
                        <td><span className={row.passRate >= 75 ? "report-good" : row.passRate >= 50 ? "report-warn" : "report-bad"}>{row.passRate.toFixed(2)}%</span></td>
                        <td><span className={row.averageScore >= 75 ? "report-good" : row.averageScore >= 50 ? "report-warn" : "report-bad"}>{row.averageScore.toFixed(2)}%</span></td>
                        <td>{formatDuration(row.averageTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {testSummaryRows.length === 0 && <p className="admin-personal-empty">No submitted tests yet.</p>}
              </div>
            </div>

            <div className="admin-test-report-table">
              <div className="admin-test-report-table-head">
                <h4>Descriptive Summary</h4>
                <span>{descriptiveTestRows.length} attempt(s)</span>
              </div>
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Test No.</th>
                      <th>Test Name</th>
                      <th>Candidate</th>
                      <th>Attempted Date & Time</th>
                      <th>Time Taken</th>
                      <th>Score (%)</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {descriptiveTestRows.slice(0, 12).map(row => (
                      <tr key={`${row.index}-${row.contact}-${row.attemptedAt || ""}`}>
                        <td>{row.index}</td>
                        <td>{row.testName}</td>
                        <td>{row.candidate}</td>
                        <td>{formatDateTime(row.attemptedAt)}</td>
                        <td>{formatDuration(row.timeTakenSeconds)}</td>
                        <td>{row.percentage}</td>
                        <td>
                          <span className={`admin-personal-status ${row.result.toLowerCase()}`}>{row.result}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {descriptiveTestRows.length === 0 && <p className="admin-personal-empty">No submitted test attempts yet.</p>}
              </div>
            </div>
          </section>
        )}

        {activePanel === "trash" && canManageSuites && (
          <section className="admin-test-report admin-trash-panel">
            <div className="admin-panel-heading">
              <h3>Trash</h3>
              <p>Deleted test suites stay here until you recover them or permanently delete them.</p>
            </div>

            <div className="admin-test-report-table">
              <div className="admin-test-report-table-head">
                <h4>Deleted Test Suites</h4>
                <span>{deletedSuites.length} suite(s)</span>
              </div>
              <div className="admin-table-scroll">
                <table className="admin-trash-table">
                  <thead>
                    <tr>
                      <th>Test Suite</th>
                      <th>Questions</th>
                      <th>Deleted Date</th>
                      <th>Deleted By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedSuites.map(suite => (
                      <tr key={suite._id}>
                        <td>
                          <strong>{suite.name}</strong>
                          <small>{suite.description || "No description"}</small>
                        </td>
                        <td>{suite.questionCount ?? 0}</td>
                        <td>{formatDateTime(suite.deletedAt)}</td>
                        <td>{deletedByLabel(suite.deletedBy)}</td>
                        <td>
                          <div className="admin-trash-actions">
                            <button
                              type="button"
                              className="admin-row-btn"
                              disabled={trashActionId === suite._id}
                              onClick={() => handleRecoverSuite(suite._id, suite.name)}
                            >
                              Recover
                            </button>
                            <button
                              type="button"
                              className="admin-delete-btn"
                              disabled={trashActionId === suite._id}
                              onClick={() => handlePermanentDeleteSuite(suite._id, suite.name)}
                            >
                              Delete Permanently
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {trashLoading && <p className="admin-personal-empty">Loading deleted test suites...</p>}
                {!trashLoading && deletedSuites.length === 0 && <p className="admin-personal-empty">Trash is empty.</p>}
              </div>
            </div>
          </section>
        )}

        {canOpenSuites ? (
        <section className="suite-section" id="admin-test-suites">
          <div className="suite-section-header">
            <div>
              <h3>{copy.testSuites}</h3>
              <p>{copy.suiteIntro}</p>
            </div>
            <div className="admin-suite-tools">
              <input
                type="search"
                value={suiteSearch}
                onChange={(e) => setSuiteSearch(e.target.value)}
                placeholder={copy.searchSuites}
                className="admin-suite-search"
              />
              <div className="admin-suite-date-filters">
                <label>
                  <span>{copy.period}</span>
                  <select
                    value={suiteDatePreset}
                    onChange={(e) => handleSuiteDatePresetChange(e.target.value)}
                  >
                    <option value="">{copy.allTime}</option>
                    <option value="last-day">Last day</option>
                    <option value="last-week">Last week</option>
                    <option value="last-month">Last month</option>
                    <option value="three-months">Last 3 months</option>
                    <option value="last-year">Last year</option>
                    {suiteDatePreset === "custom" && <option value="custom">Custom range</option>}
                  </select>
                </label>
                <label>
                  <span>{copy.from}</span>
                  <input
                    type="datetime-local"
                    value={suiteDateFrom}
                    onChange={(e) => {
                      setSuiteDatePreset("custom");
                      setSuiteDateFrom(e.target.value);
                    }}
                  />
                </label>
                <label>
                  <span>{copy.to}</span>
                  <input
                    type="datetime-local"
                    value={suiteDateTo}
                    onChange={(e) => {
                      setSuiteDatePreset("custom");
                      setSuiteDateTo(e.target.value);
                    }}
                  />
                </label>
                {suiteFiltersActive && (
                  <button
                    type="button"
                    className="admin-clear-filter-btn"
                    onClick={() => {
                      setSuiteSearch("");
                      setSuiteDatePreset("");
                      setSuiteDateFrom("");
                      setSuiteDateTo("");
                    }}
                  >
                    {copy.clear}
                  </button>
                )}
              </div>
              <button type="button" className="admin-primary-btn" onClick={openNewSuite} disabled={!canManageSuites}>
                ＋ {copy.newTestSuite}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="admin-empty-state">{copy.loadingSuites}</div>
          ) : suites.length === 0 ? (
            <div className="admin-empty-state">{copy.noSuites}</div>
          ) : filteredSuites.length === 0 ? (
            <div className="admin-empty-state">{copy.noMatchingSuites}</div>
          ) : (
            <div className="admin-suite-list">
              {filteredSuites.map(suite => (
                <article key={suite._id} className="admin-suite-card">
                  <div className="admin-suite-left">
                    <div className="admin-suite-icon">▤</div>
                    <div>
                      <h4>{suite.name}</h4>
                      <p>
                        {suite.questionCount ?? 0} questions <span>•</span> Pass {suite.passingPercentage ?? 50}%
                        <span>•</span> {suiteAttemptedUserCount(suite._id)} attempted
                        <span>•</span> Uploaded {formatDateTime(suite.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="admin-suite-actions">
                    <span className={`admin-status ${suite.status === "active" ? "active" : "draft"}`}>
                      {suite.status === "active" ? "Active" : "Draft"}
                    </span>

                    {canManageSuites && (
                      <button
                        type="button"
                        className={`admin-toggle-btn ${suite.status === "active" ? "danger" : "success"}`}
                        disabled={togglingId === suite._id}
                        onClick={(e) => handleToggleStatus(suite._id, suite.status, e)}
                      >
                        {togglingId === suite._id
                          ? "..."
                          : suite.status === "active" ? "■ Deactivate" : "▶ Activate"}
                      </button>
                    )}

                    <button type="button" className="admin-row-btn" onClick={(e) => handleCopyLink(suite._id, e)}>
                      🔗 Copy link
                    </button>
                    <button
                      type="button"
                      className="admin-open-btn"
                      onClick={() => navigate(`/admin/test-suites/${suite._id}`)}
                      disabled={!canViewQuestions}
                      title={canViewQuestions ? "Open test suite" : "View questions permission is disabled"}
                    >
                      Open
                    </button>
                    {canManageSuites && (
                      <>
                        <button type="button" className="admin-row-btn" onClick={() => { setEditingSuite(suite); setShowModal(true); }}>
                          ✎ Edit
                        </button>
                        <button type="button" className="admin-row-btn admin-results-delete-btn" onClick={() => setDeleteResultsSuite(suite)}>
                          ▧ Delete Results
                        </button>
                        <button type="button" className="admin-delete-btn" onClick={() => setDeleteSuite(suite)}>
                          ⌫ Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="admin-impact-card">
            <div>
              <span>✓</span>
              <div>
                <strong>Secure. Reliable. Impactful.</strong>
                <p>Your data is safe with us. Focus on creating impact.</p>
              </div>
            </div>
            <div className="impact-line-art" aria-hidden="true">
              <span>⌁</span><span>⌁</span><span>⌁</span>
            </div>
          </div>
        </section>
        ) : (
          <section className="suite-section" id="admin-test-suites">
            <div className="admin-empty-state">Test suite viewing permission is disabled for your account.</div>
          </section>
        )}
      </main>

      {showModal && (
        <SuiteModal
          suite={editingSuite}
          onClose={() => setShowModal(false)}
          onSave={handleModalSave}
        />
      )}

      {deleteResultsSuite && (
        <DeleteResultsModal
          suite={deleteResultsSuite}
          users={users}
          resultCount={suiteResultCount(deleteResultsSuite._id)}
          loading={deletingResults}
          onClose={() => setDeleteResultsSuite(null)}
          onDelete={handleDeleteSuiteResults}
        />
      )}

      {deleteSuite && (
        <DeleteSuiteModal
          suite={deleteSuite}
          attemptedPeople={suiteAttemptedUserCount(deleteSuite._id)}
          loading={deletingSuite}
          onClose={() => setDeleteSuite(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
