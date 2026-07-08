import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import "./superadmin.css";
import { ADMIN_PERMISSION_DEFAULTS, getAuthHeaders, getCurrentUser } from "../utils/auth";
import BulkMailPanel from "../components/BulkMailPanel";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { apiProjectsToMap, defaultOrgOptions, mergeOrgOptions, readLocalOrgOptions, writeLocalOrgOptions } from "../utils/orgOptions";

const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api`;
const API_URL = `${API_BASE}/auth`;
const LOCAL_ROLES_KEY = "snehalaya_custom_roles";
const LOCAL_RIGHTS_KEY = "snehalaya_custom_rights";
const USERS_PER_PAGE = 10;
const emptyCreateUserForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  username: "",
  contactType: "email",
  email: "",
  mobile: "",
  preferredContact: "",
  password: "",
  confirmPassword: "",
  role: "candidate",
  age: "",
  gender: "",
  project: "",
  designation: "",
  isActive: true,
};
const emptyEditUserForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  username: "",
  contactType: "email",
  email: "",
  mobile: "",
  alternateEmail: "",
  role: "candidate",
  age: "",
  gender: "",
  project: "",
  designation: "",
  isActive: true,
  resetPassword: false,
  newPassword: "",
};
const ADMIN_RIGHTS = [
  { key: "canViewReports", label: "View reports", detail: "Can open report pages and see result rows" },
  { key: "canViewTestReports", label: "View test reports", detail: "Can open the statistical and descriptive test report section" },
  { key: "canDownloadReports", label: "Download reports", detail: "Can export summary/descriptive PDF or Excel" },
  { key: "canViewSuites", label: "Open test suites", detail: "Can open test suite pages within scope" },
  { key: "canManageSuites", label: "Create / edit test suites", detail: "Can create, edit, activate, deactivate, and delete suites" },
  { key: "canViewQuestions", label: "View questions", detail: "Can see questions inside a test suite" },
  { key: "canManageQuestions", label: "Manage questions", detail: "Can add, import, edit, and delete questions" },
  { key: "canAssignTests", label: "Assign tests", detail: "Can assign test suites to candidates" },
  { key: "canBulkMail", label: "Mail candidates", detail: "Can prepare bulk emails and certificate emails" },
  { key: "canViewUsers", label: "View users", detail: "Can see candidate/admin lists within scope" },
];
const CONTROL_MODES = [
  { key: "rights", label: "User rights" },
  { key: "roles", label: "Users, roles & assignment" },
  { key: "org", label: "Projects/Departments & designations" },
  { key: "mail", label: "Bulk mail" },
];

function normalizeRights(user) {
  const saved = user?.adminPermissions || {};
  const savedPermissions = saved.permissions || {};
  return {
    permissions: Object.keys(ADMIN_PERMISSION_DEFAULTS).reduce((acc, key) => {
      acc[key] = savedPermissions[key] === undefined
        ? ADMIN_PERMISSION_DEFAULTS[key]
        : Boolean(savedPermissions[key]);
      return acc;
    }, Object.keys(savedPermissions).reduce((acc, key) => {
      acc[key] = Boolean(savedPermissions[key]);
      return acc;
    }, {})),
    scopeProjects: Array.isArray(saved.scopeProjects) ? saved.scopeProjects : [],
    scopeDepartments: Array.isArray(saved.scopeDepartments) ? saved.scopeDepartments : [],
  };
}

const emptyStats = {
  totalUsers: 0,
  activeUsers: 0,
  administrators: 0,
  totalAssessments: 0,
};

const getOverview = async () => {
  const res = await axios.get(`${API_URL}/superadmin/overview`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

function readLocalRoles() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ROLES_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocalRoles(roles) {
  localStorage.setItem(LOCAL_ROLES_KEY, JSON.stringify(roles));
}

function readLocalRights() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_RIGHTS_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocalRights(rights) {
  localStorage.setItem(LOCAL_RIGHTS_KEY, JSON.stringify(rights));
}

function customRightKey(label) {
  const slug = String(label || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `custom_${slug || Date.now()}`;
}

function candidateName(result) {
  return result.CandidateName || result.userName || "Unknown";
}

function candidateEmail(result) {
  return result.CandidateEmail || result.userEmail || "-";
}

function resultPct(result) {
  return result.totalMarks > 0 ? Math.round(((result.score || 0) / result.totalMarks) * 100) : 0;
}

function resultTestName(result, suitesById) {
  if (result.testName) return result.testName;
  if (result.suiteId?.name) return result.suiteId.name;
  const suiteId = typeof result.suiteId === "string" ? result.suiteId : result.suiteId?._id;
  return suitesById[suiteId] || "Assessment";
}

function resultStatus(result) {
  if (typeof result.passed === "boolean") return result.passed ? "Pass" : "Fail";
  return resultPct(result) >= 50 ? "Pass" : "Fail";
}

function readableActivityAction(log) {
  const action = String(log?.action || "");
  const path = String(log?.path || "");
  const method = String(log?.method || "").toUpperCase();

  if (!action || /^[A-Z]+\s+\//.test(action) || /^(Created|Updated|Deleted)\s+\//i.test(action) || /\/[0-9a-f-]{20,}/i.test(action)) {
    if (path.includes("/superadmin/users/") && path.endsWith("/access")) {
      return log?.details?.isActive === false ? "Disabled user account" : "Enabled user account";
    }
    if (path.includes("/superadmin/users/") && path.endsWith("/password")) return "Reset user password";
    if (path.includes("/superadmin/users/") && path.endsWith("/role")) return "Changed user role";
    if (path.includes("/superadmin/users/") && path.endsWith("/permissions")) return "Updated admin rights";
    if (path.includes("/superadmin/users")) {
      if (method === "POST") return "Created user account";
      if (method === "PUT" || method === "PATCH") return "Updated user account";
      if (method === "DELETE") return "Deleted user account";
    }
    if (path.includes("/permanent") && method === "DELETE") return "Permanently deleted test suite";
    if (path.includes("/suite/") && method === "DELETE") return "Deleted test results";
    if (path.includes("/test-suite") || path.includes("/test-suites")) {
      if (method === "POST") return "Created test suite";
      if (method === "PUT" || method === "PATCH") return "Updated test suite";
      if (method === "DELETE") return "Moved test suite to trash";
    }
    if (path.includes("/questions") && method === "DELETE") return "Deleted question";
    return action
      .replace(/^POST\s+/i, "Created ")
      .replace(/^PUT\s+/i, "Updated ")
      .replace(/^PATCH\s+/i, "Updated ")
      .replace(/^DELETE\s+/i, "Deleted ")
      .replace(/^\/?api\/?/i, "")
      .replace(/^auth\//i, "")
      .replace(/\/[0-9a-f-]{20,}/gi, "")
      .replace(/\/permanent/gi, " permanently")
      .replace(/[/-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return action;
}

function categoryScaleLabel(row) {
  return row?.scaleScore ? `${row.scaleScore}/10` : "-";
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || seconds === "") return "-";
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

function uniqueIndexes(indexes) {
  return [...new Set((Array.isArray(indexes) ? indexes : []).map(Number))]
    .filter(Number.isInteger);
}

function itemId(value) {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
}

function answerQuestion(answer) {
  return answer?.questionId && typeof answer.questionId === "object" ? answer.questionId : null;
}

function answerQuestionId(answer) {
  return itemId(answer?.questionId || answer?.question);
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
  if (question?.questionType === "theory") return String(answer?.textAnswer || "").trim() || "Not answered";
  return optionLabels(question, answer?.selectedOptions) || "Not answered";
}

function correctAnswerLabel(answer, question) {
  if (!question) return "Question details unavailable";
  if (question.questionType === "theory") return "Theory answer - manual review";
  return questionCategories(question, answer)
    .map(category => `${category}: ${optionLabels(question, correctIndexesForCategory(question, category)) || "-"}`)
    .join("; ") || "Correct answer unavailable";
}

function scoreSelectedOptions(selectedOptions, correctOptions) {
  const selected = uniqueIndexes(selectedOptions);
  const correct = uniqueIndexes(correctOptions);
  if (correct.length === 0) return { earnedFraction: 0, isCorrect: false };
  const hits = selected.filter(index => correct.includes(index)).length;
  const wrongs = selected.filter(index => !correct.includes(index)).length;
  const earnedFraction = Math.max(0, (hits - wrongs) / correct.length);
  return { earnedFraction, isCorrect: earnedFraction === 1 };
}

function superAdminQuestionRows(result) {
  return (result.answers || []).map((answer, index) => {
    const question = answerQuestion(answer);
    const categories = questionCategories(question, answer);
    const isTheory = question?.questionType === "theory";
    const review = isTheory
      ? "Manual review"
      : typeof answer?.isCorrect === "boolean" ? (answer.isCorrect ? "Correct" : "Incorrect") : "Not scored";
    const marks = answer?.earnedMarks !== undefined && question?.marks !== undefined
      ? `${answer.earnedMarks}/${question.marks}`
      : answer?.earnedMarks !== undefined ? String(answer.earnedMarks) : "-";
    const categoryScore = isTheory || !question
      ? "-"
      : categories.map(category => {
        const { earnedFraction, isCorrect } = scoreSelectedOptions(
          answer?.selectedOptions,
          correctIndexesForCategory(question, category)
        );
        const earned = Math.round((earnedFraction * (question.marks ?? 1)) * 100) / 100;
        return `${category}: ${isCorrect ? "Correct" : "Incorrect"} (${earned}/${question.marks ?? 1})`;
      }).join("; ");

    return {
      number: index + 1,
      questionId: answerQuestionId(answer),
      question: question?.questionText || `Question ${index + 1}`,
      categories: categories.join(", "),
      selected: selectedAnswerLabel(answer, question),
      correct: correctAnswerLabel(answer, question),
      review,
      marks,
      categoryScore,
    };
  });
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

function userNameKey(user) {
  return String(user?.name || "").trim().toLowerCase();
}

function userContact(user) {
  return String(user?.email || user?.mobile || user?.username || "").trim();
}

function userOptionLabel(user) {
  const name = user?.name || user?.username || user?.email || user?.mobile || "Unnamed user";
  const contact = userContact(user);
  return contact ? `${name} - ${contact}` : name;
}

function userMatchesSearch(user, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    userOptionLabel(user),
    user?.role,
    user?.customRole,
    user?.project,
    user?.designation,
    user?.email,
    user?.mobile,
    user?.username,
    user?.name,
  ].filter(Boolean).join(" ").toLowerCase().includes(needle);
}

function keepSelectedOptionVisible(options, selectedUser) {
  if (!selectedUser?._id || options.some(user => user._id === selectedUser._id)) {
    return options;
  }
  return [selectedUser, ...options];
}

function splitNameParts(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] || "", middleName: "", lastName: "" };
  }
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts.slice(-1)[0],
  };
}

function fullNameFromForm(form) {
  return [form.firstName, form.middleName, form.lastName]
    .map(part => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function userToEditForm(user) {
  if (!user) return emptyEditUserForm;
  const hasEmail = Boolean(user.email);
  const nameParts = splitNameParts(user.name);
  return {
    ...nameParts,
    username: user.username || "",
    contactType: hasEmail ? "email" : "mobile",
    email: user.email || "",
    mobile: user.mobile || "",
    alternateEmail: "",
    role: user.customRole || user.role || "candidate",
    age: user.age || "",
    gender: user.gender || "",
    project: user.project || "",
    designation: user.designation || "",
    isActive: user.isActive !== false,
    resetPassword: false,
    newPassword: "",
  };
}

function roleAssignmentUsers(users) {
  const namesWithEmail = new Set(
    users
      .filter(user => String(user?.email || "").trim())
      .map(userNameKey)
      .filter(Boolean)
  );
  const seen = new Set();

  return users.filter(user => {
    const contact = userContact(user);
    const nameKey = userNameKey(user);
    const email = String(user?.email || "").trim();
    if (!contact) return false;
    if (!email && nameKey && namesWithEmail.has(nameKey)) return false;

    const uniqueKey = email
      ? `email:${email.toLowerCase()}`
      : `contact:${contact.toLowerCase()}`;
    if (seen.has(uniqueKey)) return false;
    seen.add(uniqueKey);
    return true;
  });
}

function saveReportsExcel(results, suitesById, reportType) {
  const wb = XLSX.utils.book_new();
  const summaryHeaders = ["Test Name", "Candidate", "Email", "Project/Department", "Designation", "Score", "Percentage", "Result", "Attempted At", "Time Taken"];
  const summaryRows = results.map(result => [
    resultTestName(result, suitesById),
    candidateName(result),
    candidateEmail(result),
    result.project || "-",
    result.designation || "-",
    `${result.score || 0}/${result.totalMarks || 0}`,
    `${resultPct(result)}%`,
    resultStatus(result),
    formatDateTime(result.submittedAt),
    formatDuration(result.timeTakenSeconds),
  ]);

  if (reportType !== "descriptive") {
    const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    summarySheet["!cols"] = summaryHeaders.map(header => ({ wch: Math.max(16, header.length + 4) }));
    summarySheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: summaryRows.length, c: summaryHeaders.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
  }

  if (reportType === "descriptive") {
    const candidateHeaders = [
      "#",
      ...summaryHeaders,
      "Total Questions",
      "Correct Answers",
    ];
    const candidateRows = results.map((result, index) => [
      index + 1,
      ...summaryRows[index],
      result.totalQuestions ?? (result.answers || []).length,
      result.correctAnswers ?? "-",
    ]);
    const candidateSheet = XLSX.utils.aoa_to_sheet([candidateHeaders, ...candidateRows]);
    candidateSheet["!cols"] = [
      { wch: 8 },
      ...summaryHeaders.map(header => ({ wch: Math.max(18, header.length + 4) })),
      { wch: 18 },
      { wch: 18 },
    ];
    candidateSheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: candidateRows.length, c: candidateHeaders.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, candidateSheet, "Candidate Detail");

    const categoryHeaders = ["Test Name", "Candidate", "Email", "Project/Department", "Designation", "Attempted At", "Category", "Score", "Total", "Percentage", "Scale Score", "Trait", "Description"];
    const categoryRows = [];
    results.forEach(result => {
      const rows = Array.isArray(result.categoryResults) && result.categoryResults.length
        ? result.categoryResults
        : [{ category: "Overall", score: result.score || 0, total: result.totalMarks || 0, percentage: resultPct(result) }];
      rows.forEach(row => {
        categoryRows.push([
          resultTestName(result, suitesById),
          candidateName(result),
          candidateEmail(result),
          result.project || "-",
          result.designation || "-",
          formatDateTime(result.submittedAt),
          row.category || "Overall",
          row.score ?? row.earnedMarks ?? 0,
          row.total ?? 0,
          `${row.percentage ?? 0}%`,
          categoryScaleLabel(row),
          row.scaleLabel || "-",
          row.description || "-",
        ]);
      });
    });
    const categorySheet = XLSX.utils.aoa_to_sheet([categoryHeaders, ...categoryRows]);
    categorySheet["!cols"] = [
      { wch: 24 },
      { wch: 24 },
      { wch: 30 },
      { wch: 24 },
      { wch: 24 },
      { wch: 22 },
      { wch: 24 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
    ];
    categorySheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: categoryRows.length, c: categoryHeaders.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, categorySheet, "Category Detail");

    const questionHeaders = [
      "Test Name",
      "Candidate",
      "Email",
      "Project/Department",
      "Designation",
      "Attempted At",
      "Q No.",
      "Question",
      "Category",
      "Selected Answer",
      "Correct Answer",
      "Review",
      "Marks",
      "Category Score",
    ];
    const questionRows = [];
    results.forEach(result => {
      superAdminQuestionRows(result).forEach(row => {
        questionRows.push([
          resultTestName(result, suitesById),
          candidateName(result),
          candidateEmail(result),
          result.project || "-",
          result.designation || "-",
          formatDateTime(result.submittedAt),
          row.number,
          row.question,
          row.categories,
          row.selected,
          row.correct,
          row.review,
          row.marks,
          row.categoryScore,
        ]);
      });
    });
    const questionSheet = XLSX.utils.aoa_to_sheet([questionHeaders, ...questionRows]);
    questionSheet["!cols"] = [
      { wch: 24 },
      { wch: 24 },
      { wch: 30 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 8 },
      { wch: 56 },
      { wch: 24 },
      { wch: 28 },
      { wch: 48 },
      { wch: 14 },
      { wch: 12 },
      { wch: 48 },
    ];
    questionSheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: questionRows.length, c: questionHeaders.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, questionSheet, "Question Detail");
  }

  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Views = [{ activeTab: 0 }];
  XLSX.writeFile(wb, `${reportType}_superadmin_results_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function saveReportsPDF(results, suitesById, reportType) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const title = reportType === "descriptive" ? "Super Admin Descriptive Results" : "Super Admin Summary Results";
  doc.setFillColor(26, 61, 40);
  doc.rect(0, 0, 297, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString(), 283, 14, { align: "right" });

  autoTable(doc, {
    startY: 30,
    head: [["#", "Test Name", "Candidate", "Email", "Project/Department", "Designation", "Score", "%", "Result", "Attempted At"]],
    body: results.map((result, index) => [
      index + 1,
      resultTestName(result, suitesById),
      candidateName(result),
      candidateEmail(result),
      result.project || "-",
      result.designation || "-",
      `${result.score || 0}/${result.totalMarks || 0}`,
      `${resultPct(result)}%`,
      resultStatus(result),
      formatDateTime(result.submittedAt),
    ]),
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [26, 61, 40], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 247, 244] },
  });

  if (reportType === "descriptive") {
    results.forEach((result, index) => {
      doc.addPage("a4", "landscape");
      doc.setTextColor(26, 61, 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`${index + 1}. ${candidateName(result)} - ${resultTestName(result, suitesById)}`, 14, 16);
      autoTable(doc, {
        startY: 24,
        head: [["Category", "Score", "Total", "Percentage", "Scale", "Trait", "Description"]],
        body: (Array.isArray(result.categoryResults) && result.categoryResults.length
          ? result.categoryResults
          : [{ category: "Overall", score: result.score || 0, total: result.totalMarks || 0, percentage: resultPct(result) }]
        ).map(row => [
          row.category || "Overall",
          row.score ?? row.earnedMarks ?? 0,
          row.total ?? 0,
          `${row.percentage ?? 0}%`,
          categoryScaleLabel(row),
          row.scaleLabel || "-",
          row.description || "-",
        ]),
        headStyles: { fillColor: [26, 61, 40], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2.5 },
      });
    });
  }

  doc.save(`${reportType}_superadmin_results_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function SuperAdmin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [search, setSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeNav, setActiveNav] = useState("dashboard");
  const [reportResults, setReportResults] = useState([]);
  const [suitesById, setSuitesById] = useState({});
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityFromDate, setActivityFromDate] = useState("");
  const [activityToDate, setActivityToDate] = useState("");
  const [controlMode, setControlMode] = useState("rights");
  const [roles, setRoles] = useState([
    { name: "candidate", baseRole: "candidate", system: true },
    { name: "admin", baseRole: "admin", system: true },
    { name: "superadmin", baseRole: "admin", system: true },
    ...readLocalRoles(),
  ]);
  const [createUserForm, setCreateUserForm] = useState(emptyCreateUserForm);
  const [creatingUser, setCreatingUser] = useState(false);
  const [editUserId, setEditUserId] = useState("");
  const [editUserSearch, setEditUserSearch] = useState("");
  const [editUserForm, setEditUserForm] = useState(emptyEditUserForm);
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: "", baseRole: "candidate", description: "" });
  const [assignUserId, setAssignUserId] = useState("");
  const [assignUserSearch, setAssignUserSearch] = useState("");
  const [assignRole, setAssignRole] = useState("candidate");
  const [orgOptions, setOrgOptions] = useState(defaultOrgOptions);
  const [projectName, setProjectName] = useState("");
  const [departmentProject, setDepartmentProject] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [editProjectOriginal, setEditProjectOriginal] = useState("");
  const [editProjectName, setEditProjectName] = useState("");
  const [editDepartmentProject, setEditDepartmentProject] = useState("");
  const [editDepartmentOriginal, setEditDepartmentOriginal] = useState("");
  const [editDepartmentName, setEditDepartmentName] = useState("");
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [rightsUserId, setRightsUserId] = useState("");
  const [rightsForm, setRightsForm] = useState(() => normalizeRights());
  const [rightsSaving, setRightsSaving] = useState(false);
  const [customRights, setCustomRights] = useState(() => readLocalRights());
  const [customRightForm, setCustomRightForm] = useState({ label: "", detail: "" });

  const setOverview = useCallback((overview) => {
    setUsers(overview.users);
    setStats(overview.stats);
    setError("");
  }, []);

  const loadActivityLogs = useCallback(async (overrides = {}) => {
    const nextSearch = overrides.search ?? activitySearch;
    const nextFrom = overrides.from ?? activityFromDate;
    const nextTo = overrides.to ?? activityToDate;
    setActivityLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_URL}/superadmin/activity-logs`, {
        headers: getAuthHeaders(),
        params: {
          search: nextSearch.trim() || undefined,
          from: nextFrom || undefined,
          to: nextTo || undefined,
          _: Date.now(),
        },
      });
      setActivityLogs(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load activity logs");
    } finally {
      setActivityLoading(false);
    }
  }, [activitySearch, activityFromDate, activityToDate]);

  useEffect(() => {
    let ignore = false;
    getOverview()
      .then((overview) => { if (!ignore) setOverview(overview); })
      .catch((err) => { if (!ignore) setError(err.response?.data?.message || "Unable to load users"); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [setOverview]);

  useEffect(() => {
    if (activeNav !== "reports") return;
    let ignore = false;
    const fetchReports = async () => {
      setReportsLoading(true);
      try {
        const headers = getAuthHeaders();
        const [resultsRes, suitesRes] = await Promise.all([
          axios.get(`${API_BASE}/results/all`, { headers }),
          axios.get(`${API_BASE}/test-suites`, { headers }),
        ]);
        if (ignore) return;
        setReportResults(resultsRes.data);
        const nextSuites = {};
        suitesRes.data.forEach(suite => { nextSuites[suite._id] = suite.name; });
        setSuitesById(nextSuites);
      } catch (err) {
        if (!ignore) setError(err.response?.data?.message || "Unable to load reports");
      } finally {
        if (!ignore) setReportsLoading(false);
      }
    };
    fetchReports();
    return () => { ignore = true; };
  }, [activeNav]);

  useEffect(() => {
    if (activeNav !== "management") return;
    const headers = getAuthHeaders();
    axios.get(`${API_URL}/superadmin/roles`, { headers })
      .then(res => setRoles(res.data))
      .catch(() => setRoles(prev => [...prev.filter(role => role.system), ...readLocalRoles()]));
    axios.get(`${API_URL}/org-options`, { headers })
      .then(res => setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data))))
      .catch(() => setOrgOptions(defaultOrgOptions()));
  }, [activeNav]);

  useEffect(() => {
    if (activeNav !== "activity") return;
    loadActivityLogs({
      search: activitySearch,
      from: activityFromDate,
      to: activityToDate,
    });
    // Only auto-load when opening the tab; Search/Refresh buttons handle filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNav]);

  const updateAccess = async (userId, isActive) => {
    const previousUsers = users;
    const previousStats = stats;
    const targetUser = users.find(user => user._id === userId);
    if (targetUser) {
      const wasActive = targetUser.isActive !== false;
      setUsers(prev => prev.map(user => user._id === userId ? { ...user, isActive } : user));
      if (wasActive !== isActive) {
        setStats(prev => ({
          ...prev,
          activeUsers: Math.max(0, prev.activeUsers + (isActive ? 1 : -1)),
        }));
      }
    }

    try {
      const res = await axios.put(
        `${API_URL}/superadmin/users/${userId}/access`,
        { isActive },
        { headers: getAuthHeaders() }
      );
      setUsers(prev => prev.map(user => user._id === res.data._id ? res.data : user));
      getOverview().then(setOverview).catch(() => {});
    } catch (err) {
      setUsers(previousUsers);
      setStats(previousStats);
      alert(err.response?.data?.message || "Unable to update user access");
    }
  };

  const updateCreateUserForm = (field, value) => {
    setCreateUserForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === "project" ? { designation: "" } : {}),
      ...(field === "contactType" ? { email: "", mobile: "" } : {}),
    }));
  };

  const openEditUser = (user) => {
    if (!user?._id) return;
    setActiveNav("management");
    setControlMode("roles");
    setEditUserId(user._id);
    setEditUserForm(userToEditForm(user));
    requestAnimationFrame(() => {
      document.getElementById("edit-user-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleEditUserChange = (userId) => {
    setEditUserId(userId);
    setEditUserForm(userToEditForm(users.find(user => user._id === userId)));
  };

  const updateEditUserForm = (field, value) => {
    setEditUserForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === "project" ? { designation: "" } : {}),
      ...(field === "contactType" ? { email: "", mobile: "" } : {}),
    }));
  };

  const saveEditedUser = async () => {
    if (!editUserId) return alert("Select a user to edit.");
    const fullName = fullNameFromForm(editUserForm);
    if (!fullName) return alert("Enter full name.");
    if (!editUserForm.username.trim()) return alert("Enter username.");
    if (editUserForm.contactType === "email" && (!editUserForm.email.trim() || !editUserForm.email.includes("@") || !editUserForm.email.includes("."))) {
      return alert("Enter a valid email address.");
    }
    if (editUserForm.contactType === "mobile" && editUserForm.mobile.replace(/\D/g, "").length < 10) {
      return alert("Enter a valid mobile number.");
    }
    if (editUserForm.age && (Number(editUserForm.age) < 10 || Number(editUserForm.age) > 100)) {
      return alert("Enter a valid age between 10 and 100.");
    }
    if (editUserForm.resetPassword && editUserForm.newPassword.length < 6) {
      return alert("New password must be at least 6 characters.");
    }

    setSavingEditUser(true);
    try {
      const payload = {
        name: fullName,
        username: editUserForm.username.trim(),
        email: editUserForm.contactType === "email" ? editUserForm.email.trim().toLowerCase() : "",
        mobile: editUserForm.contactType === "mobile" ? editUserForm.mobile.trim() : "",
        role: editUserForm.role,
        age: editUserForm.age ? Number(editUserForm.age) : "",
        gender: editUserForm.gender,
        project: editUserForm.project,
        designation: editUserForm.designation,
        isActive: editUserForm.isActive,
      };
      const res = await axios.put(`${API_URL}/superadmin/users/${editUserId}`, payload, { headers: getAuthHeaders() });
      let passwordResetFailed = false;
      if (editUserForm.resetPassword) {
        try {
          await axios.put(
            `${API_URL}/superadmin/users/${editUserId}/password`,
            { password: editUserForm.newPassword },
            { headers: getAuthHeaders() }
          );
        } catch {
          passwordResetFailed = true;
        }
      }
      setUsers(prev => prev.map(user => user._id === res.data._id ? res.data : user));
      setEditUserForm(userToEditForm(res.data));
      getOverview().then(setOverview).catch(() => {});
      alert(passwordResetFailed
        ? "User details saved, but password reset failed. Try resetting the password again."
        : "User updated successfully."
      );
    } catch (err) {
      alert(err.response?.data?.message || "Unable to update user. CloudJiffy backend may need redeploy.");
    } finally {
      setSavingEditUser(false);
    }
  };

  const createUserAccount = async () => {
    const fullName = fullNameFromForm(createUserForm);
    if (!fullName) return alert("Enter full name.");
    if (!createUserForm.username.trim()) return alert("Enter username.");
    if (createUserForm.contactType === "email" && (!createUserForm.email.trim() || !createUserForm.email.includes("@") || !createUserForm.email.includes("."))) {
      return alert("Enter a valid email address.");
    }
    if (createUserForm.contactType === "mobile" && createUserForm.mobile.replace(/\D/g, "").length < 10) {
      return alert("Enter a valid mobile number.");
    }
    if (!createUserForm.password || createUserForm.password.length < 6) return alert("Password must be at least 6 characters.");
    if (createUserForm.password !== createUserForm.confirmPassword) return alert("Password and confirm password must match.");
    if (!createUserForm.age || Number(createUserForm.age) < 10 || Number(createUserForm.age) > 100) return alert("Enter a valid age between 10 and 100.");
    if (!createUserForm.gender) return alert("Select gender.");
    if (!createUserForm.project) return alert("Select project/department.");
    if (!createUserForm.designation) return alert("Select designation.");

    setCreatingUser(true);
    try {
      const payload = {
        name: fullName,
        username: createUserForm.username.trim(),
        email: createUserForm.contactType === "email" ? createUserForm.email.trim().toLowerCase() : "",
        mobile: createUserForm.contactType === "mobile" ? createUserForm.mobile.trim() : "",
        password: createUserForm.password,
        role: createUserForm.role,
        age: createUserForm.age ? Number(createUserForm.age) : "",
        gender: createUserForm.gender,
        project: createUserForm.project,
        designation: createUserForm.designation,
        isActive: createUserForm.isActive,
      };
      const res = await axios.post(`${API_URL}/superadmin/users`, payload, { headers: getAuthHeaders() });
      setUsers(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setStats(prev => ({
        ...prev,
        totalUsers: prev.totalUsers + 1,
        activeUsers: prev.activeUsers + 1,
        administrators: ["admin", "superadmin"].includes(res.data.role) ? prev.administrators + 1 : prev.administrators,
      }));
      setCreateUserForm(emptyCreateUserForm);
      alert("User created successfully.");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to create user.");
    } finally {
      setCreatingUser(false);
    }
  };

  const createRole = async () => {
    const name = roleForm.name.trim();
    if (!name) return alert("Enter a role name.");
    const payload = { ...roleForm, name };
    try {
      const res = await axios.post(`${API_URL}/superadmin/roles`, payload, { headers: getAuthHeaders() });
      setRoles(prev => [...prev, { ...res.data, system: false }]);
      setRoleForm({ name: "", baseRole: "candidate", description: "" });
    } catch (err) {
      if (err.response?.status === 404) {
        const nextRole = { ...payload, system: false };
        const nextRoles = [...readLocalRoles().filter(role => role.name.toLowerCase() !== name.toLowerCase()), nextRole];
        writeLocalRoles(nextRoles);
        setRoles(prev => [...prev.filter(role => role.system), ...nextRoles]);
        setRoleForm({ name: "", baseRole: "candidate", description: "" });
        alert("Role saved locally. Redeploy CloudJiffy backend to save roles for all admins.");
      } else {
        alert(err.response?.data?.message || "Unable to create role");
      }
    }
  };

  const assignUserRole = async () => {
    if (!assignUserId || !assignRole) return alert("Select a user and role.");
    try {
      const res = await axios.put(
        `${API_URL}/superadmin/users/${assignUserId}/role`,
        { role: assignRole },
        { headers: getAuthHeaders() }
      );
      setUsers(prev => prev.map(user => user._id === res.data._id ? res.data : user));
      setAssignUserId("");
      setAssignRole("candidate");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to assign role. CloudJiffy backend may need redeploy.");
    }
  };

  const handleRightsUserChange = (userId) => {
    setRightsUserId(userId);
    const selected = users.find(user => user._id === userId);
    setRightsForm(normalizeRights(selected));
  };

  const setRightsProject = (project) => {
    setRightsForm(prev => ({
      ...prev,
      scopeProjects: project ? [project] : [],
      scopeDepartments: [],
    }));
  };

  const toggleRightsDepartment = (department) => {
    setRightsForm(prev => {
      const selected = prev.scopeDepartments.includes(department);
      return {
        ...prev,
        scopeDepartments: selected
          ? prev.scopeDepartments.filter(item => item !== department)
          : [...prev.scopeDepartments, department],
      };
    });
  };

  const toggleRight = (key) => {
    setRightsForm(prev => {
      const nextValue = !prev.permissions[key];
      const permissions = { ...prev.permissions, [key]: nextValue };
      if (key === "canViewSuites" && !nextValue) permissions.canManageSuites = false;
      if (key === "canManageSuites" && nextValue) permissions.canViewSuites = true;
      if (key === "canViewQuestions" && !nextValue) permissions.canManageQuestions = false;
      if (key === "canManageQuestions" && nextValue) permissions.canViewQuestions = true;
      return { ...prev, permissions };
    });
  };

  const addCustomRight = () => {
    const label = customRightForm.label.trim();
    if (!label) return alert("Enter a right name.");
    const key = customRightKey(label);
    const allRights = [...ADMIN_RIGHTS, ...customRights];
    if (allRights.some(right => right.key === key || right.label.toLowerCase() === label.toLowerCase())) {
      return alert("This right already exists.");
    }

    const nextRight = {
      key,
      label,
      detail: customRightForm.detail.trim() || "Custom right created by superadmin",
      custom: true,
    };
    const nextRights = [...customRights, nextRight];
    setCustomRights(nextRights);
    writeLocalRights(nextRights);
    setRightsForm(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: true },
    }));
    setCustomRightForm({ label: "", detail: "" });
  };

  const saveAdminRights = async () => {
    if (!rightsUserId) return alert("Select an admin first.");
    setRightsSaving(true);
    try {
      const res = await axios.put(
        `${API_URL}/superadmin/users/${rightsUserId}/permissions`,
        rightsForm,
        { headers: getAuthHeaders() }
      );
      setUsers(prev => prev.map(user => user._id === res.data._id ? res.data : user));
      setRightsForm(normalizeRights(res.data));
      alert("Admin rights saved.");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to save admin rights.");
    } finally {
      setRightsSaving(false);
    }
  };

  const openResetPassword = (user) => {
    setResetUser(user);
    setResetPassword("");
  };

  const resetUserPassword = async () => {
    if (!resetUser) return;
    if (resetPassword.length < 6) return alert("Temporary password must be at least 6 characters.");

    setResetSaving(true);
    try {
      const res = await axios.put(
        `${API_URL}/superadmin/users/${resetUser._id}/password`,
        { password: resetPassword },
        { headers: getAuthHeaders() }
      );
      setUsers(prev => prev.map(user => user._id === res.data.user._id ? res.data.user : user));
      setResetUser(null);
      setResetPassword("");
      alert("Password reset successfully. Share the temporary password securely with the user.");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to reset password. CloudJiffy backend may need redeploy.");
    } finally {
      setResetSaving(false);
    }
  };

  const deleteUserAccount = async (targetUser) => {
    if (!targetUser?._id) return;
    if (targetUser._id === currentUser?._id) {
      return alert("You cannot delete your own account.");
    }

    const contact = targetUser.email || targetUser.mobile || targetUser.username || "no contact";
    const confirmation = window.prompt(
      `Delete user ${targetUser.name || "this user"} (${contact})?\n\nThis removes their login account. Type DELETE to confirm.`
    );
    if (confirmation !== "DELETE") return;

    try {
      const res = await axios.delete(`${API_URL}/superadmin/users/${targetUser._id}`, {
        headers: getAuthHeaders(),
      });
      setUsers(prev => prev.filter(user => user._id !== targetUser._id));
      if (assignUserId === targetUser._id) setAssignUserId("");
      if (editUserId === targetUser._id) {
        setEditUserId("");
        setEditUserForm(emptyEditUserForm);
      }
      if (rightsUserId === targetUser._id) {
        setRightsUserId("");
        setRightsForm(normalizeRights());
      }
      if (resetUser?._id === targetUser._id) {
        setResetUser(null);
        setResetPassword("");
      }
      alert(res.data?.message || "User deleted successfully.");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to delete user.");
    }
  };

  const saveProjectLocal = (name) => {
    const nextOptions = mergeOrgOptions(orgOptions, { [name]: [] });
    writeLocalOrgOptions(nextOptions);
    setOrgOptions(nextOptions);
  };

  const saveEditedProjectLocal = (currentName, nextName) => {
    const hasDuplicate = Object.keys(orgOptions).some(project =>
      project.toLowerCase() === nextName.toLowerCase() &&
      project.toLowerCase() !== currentName.toLowerCase()
    );
    if (hasDuplicate) {
      alert("Project/department already exists.");
      return false;
    }

    const nextOptions = Object.entries(orgOptions).reduce((acc, [project, departments]) => {
      acc[project.toLowerCase() === currentName.toLowerCase() ? nextName : project] = departments;
      return acc;
    }, {});
    writeLocalOrgOptions(nextOptions);
    setOrgOptions(nextOptions);
    if (departmentProject === currentName) setDepartmentProject(nextName);
    if (editDepartmentProject === currentName) setEditDepartmentProject(nextName);
    return true;
  };

  const saveEditedDepartmentLocal = (projectName, currentDepartment, nextDepartment) => {
    const departments = orgOptions[projectName] || [];
    const hasDuplicate = departments.some(department =>
      department.toLowerCase() === nextDepartment.toLowerCase() &&
      department.toLowerCase() !== currentDepartment.toLowerCase()
    );
    if (hasDuplicate) {
      alert("Designation already exists in this project/department.");
      return false;
    }

    const nextOptions = {
      ...orgOptions,
      [projectName]: departments.map(department =>
        department.toLowerCase() === currentDepartment.toLowerCase() ? nextDepartment : department
      ),
    };
    writeLocalOrgOptions(nextOptions);
    setOrgOptions(nextOptions);
    return true;
  };

  const deleteProjectLocal = (projectName) => {
    const nextOptions = Object.entries(orgOptions).reduce((acc, [project, departments]) => {
      if (project.toLowerCase() !== projectName.toLowerCase()) acc[project] = departments;
      return acc;
    }, {});
    writeLocalOrgOptions(nextOptions);
    setOrgOptions(nextOptions);
    if (departmentProject === projectName) setDepartmentProject("");
    if (editProjectOriginal === projectName) {
      setEditProjectOriginal("");
      setEditProjectName("");
    }
    if (editDepartmentProject === projectName) {
      setEditDepartmentProject("");
      setEditDepartmentOriginal("");
      setEditDepartmentName("");
    }
  };

  const deleteDepartmentLocal = (projectName, departmentName) => {
    const nextOptions = {
      ...orgOptions,
      [projectName]: (orgOptions[projectName] || []).filter(department =>
        department.toLowerCase() !== departmentName.toLowerCase()
      ),
    };
    writeLocalOrgOptions(nextOptions);
    setOrgOptions(nextOptions);
    if (editDepartmentProject === projectName && editDepartmentOriginal === departmentName) {
      setEditDepartmentOriginal("");
      setEditDepartmentName("");
    }
  };

  const addProject = async () => {
    const name = projectName.trim();
    if (!name) return alert("Enter a project/department name.");
    try {
      const res = await axios.post(`${API_URL}/superadmin/org-options/projects`, { name }, { headers: getAuthHeaders() });
      setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data)));
    } catch {
      saveProjectLocal(name);
      alert("Project saved locally. Redeploy CloudJiffy backend to save it for everyone.");
    }
    setProjectName("");
  };

  const addDepartment = async () => {
    const project = departmentProject.trim();
    const department = departmentName.trim();
    if (!project || !department) return alert("Select a project/department and enter a designation.");
    try {
      const res = await axios.post(`${API_URL}/superadmin/org-options/departments`, { project, department }, { headers: getAuthHeaders() });
      setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data)));
    } catch {
      const nextOptions = mergeOrgOptions(orgOptions, { [project]: [...(orgOptions[project] || []), department] });
      writeLocalOrgOptions(nextOptions);
      setOrgOptions(nextOptions);
      alert("Designation saved locally. Redeploy CloudJiffy backend to save it for everyone.");
    }
    setDepartmentName("");
  };

  const updateProject = async () => {
    const currentName = editProjectOriginal.trim();
    const nextName = editProjectName.trim();
    if (!currentName || !nextName) return alert("Select a project/department and enter the updated name.");
    try {
      const res = await axios.put(
        `${API_URL}/superadmin/org-options/projects/${encodeURIComponent(currentName)}`,
        { name: nextName },
        { headers: getAuthHeaders() }
      );
      setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data)));
      setEditProjectOriginal(nextName);
      setEditProjectName(nextName);
      alert("Project/department updated successfully.");
    } catch (err) {
      if (saveEditedProjectLocal(currentName, nextName)) {
        setEditProjectOriginal(nextName);
        setEditProjectName(nextName);
        alert(err.response?.data?.message || "Project updated locally. Redeploy CloudJiffy backend to save it for everyone.");
      }
    }
  };

  const updateDepartment = async () => {
    const project = editDepartmentProject.trim();
    const currentDepartment = editDepartmentOriginal.trim();
    const nextDepartment = editDepartmentName.trim();
    if (!project || !currentDepartment || !nextDepartment) {
      return alert("Select a project/department, designation, and enter the updated designation.");
    }
    try {
      const res = await axios.put(
        `${API_URL}/superadmin/org-options/departments`,
        { project, oldDepartment: currentDepartment, department: nextDepartment },
        { headers: getAuthHeaders() }
      );
      setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data)));
      setEditDepartmentOriginal(nextDepartment);
      setEditDepartmentName(nextDepartment);
      alert("Designation updated successfully.");
    } catch (err) {
      if (saveEditedDepartmentLocal(project, currentDepartment, nextDepartment)) {
        setEditDepartmentOriginal(nextDepartment);
        setEditDepartmentName(nextDepartment);
        alert(err.response?.data?.message || "Designation updated locally. Redeploy CloudJiffy backend to save it for everyone.");
      }
    }
  };

  const deleteProject = async (project) => {
    if (!project) return;
    const departments = orgOptions[project] || [];
    const confirmation = window.prompt(
      `Delete project/department "${project}" and its ${departments.length} designation(s)?\n\nExisting users keep their saved value, but it will be removed from dropdowns. Type DELETE to confirm.`
    );
    if (confirmation !== "DELETE") return;
    try {
      const res = await axios.delete(
        `${API_URL}/superadmin/org-options/projects/${encodeURIComponent(project)}`,
        { headers: getAuthHeaders() }
      );
      setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data)));
      if (departmentProject === project) setDepartmentProject("");
      if (editProjectOriginal === project) {
        setEditProjectOriginal("");
        setEditProjectName("");
      }
      if (editDepartmentProject === project) {
        setEditDepartmentProject("");
        setEditDepartmentOriginal("");
        setEditDepartmentName("");
      }
      alert("Project/department deleted successfully.");
    } catch (err) {
      deleteProjectLocal(project);
      alert(err.response?.data?.message || "Project deleted locally. Redeploy CloudJiffy backend to save it for everyone.");
    }
  };

  const deleteDepartment = async (project, department) => {
    if (!project || !department) return;
    const confirmation = window.prompt(
      `Delete designation "${department}" from "${project}"?\n\nExisting users keep their saved value, but it will be removed from dropdowns. Type DELETE to confirm.`
    );
    if (confirmation !== "DELETE") return;
    try {
      const res = await axios.delete(`${API_URL}/superadmin/org-options/departments`, {
        headers: getAuthHeaders(),
        data: { project, department },
      });
      setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data)));
      if (editDepartmentProject === project && editDepartmentOriginal === department) {
        setEditDepartmentOriginal("");
        setEditDepartmentName("");
      }
      alert("Designation deleted successfully.");
    } catch (err) {
      deleteDepartmentLocal(project, department);
      alert(err.response?.data?.message || "Designation deleted locally. Redeploy CloudJiffy backend to save it for everyone.");
    }
  };

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  const displayUsers = roleAssignmentUsers(users);
  const displayStats = {
    totalUsers: displayUsers.length,
    activeUsers: displayUsers.filter(user => user.isActive !== false).length,
    administrators: displayUsers.filter(user => user.role === "admin" || user.role === "superadmin").length,
    totalAssessments: stats.totalAssessments,
  };

  const getFilteredUsers = () => {
    let base = displayUsers;
    if (activeNav === "Candidates") base = displayUsers.filter(u => u.role === "candidate");
    if (activeNav === "administrators") base = displayUsers.filter(u => u.role === "admin" || u.role === "superadmin");
    return base.filter(u =>
      `${u.name} ${u.email} ${u.mobile} ${u.username} ${u.role} ${u.customRole || ""} ${u.project || ""} ${u.designation || ""}`.toLowerCase().includes(search.toLowerCase())
    );
  };

  const filteredUsers = getFilteredUsers();
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const safeUserPage = Math.min(userPage, totalUserPages);
  const paginatedUsers = filteredUsers.slice((safeUserPage - 1) * USERS_PER_PAGE, safeUserPage * USERS_PER_PAGE);
  const userPageStart = filteredUsers.length === 0 ? 0 : (safeUserPage - 1) * USERS_PER_PAGE + 1;
  const userPageEnd = Math.min(filteredUsers.length, safeUserPage * USERS_PER_PAGE);
  const filteredReports = reportResults.filter(result =>
    [
      resultTestName(result, suitesById),
      candidateName(result),
      candidateEmail(result),
      result.project,
      result.designation,
    ].join(" ").toLowerCase().includes(reportSearch.toLowerCase())
  );
  const adminUsers = displayUsers.filter(user => user.role === "admin" || user.role === "superadmin");
  const rightsRows = [...ADMIN_RIGHTS, ...customRights];
  const selectedRightsUser = users.find(user => user._id === rightsUserId);
  const rightsProject = rightsForm.scopeProjects[0] || "";
  const rightsDepartments = rightsProject
    ? (orgOptions[rightsProject] || [])
    : [];
  const createUserProjectNames = Object.keys(orgOptions).sort((a, b) => a.localeCompare(b));
  const createUserDepartments = createUserForm.project ? orgOptions[createUserForm.project] || [] : [];
  const editUserDepartments = editUserForm.project ? orgOptions[editUserForm.project] || [] : [];
  const editDepartmentOptions = editDepartmentProject ? orgOptions[editDepartmentProject] || [] : [];
  const assignableRoles = roles.filter(role => role.name !== "superadmin" && !role.disabled);
  const safeEditRoles = roles.filter(role => role.name !== "superadmin" || editUserForm.role === "superadmin");
  const editRoleOptions = safeEditRoles.some(role => role.name === editUserForm.role)
    ? safeEditRoles
    : [...safeEditRoles, { name: editUserForm.role, system: true }];
  const roleUsers = displayUsers;
  const selectedEditUser = roleUsers.find(user => user._id === editUserId);
  const selectedAssignUser = roleUsers.find(user => user._id === assignUserId);
  const editUserOptions = keepSelectedOptionVisible(
    roleUsers.filter(user => userMatchesSearch(user, editUserSearch)),
    selectedEditUser
  );
  const assignUserOptions = keepSelectedOptionVisible(
    roleUsers.filter(user => userMatchesSearch(user, assignUserSearch)),
    selectedAssignUser
  );

  const getSectionTitle = () => {
    if (activeNav === "Candidates") return t("candidates");
    if (activeNav === "administrators") return t("administrators");
    if (activeNav === "reports") return t("reports");
    if (activeNav === "activity") return t("activityLogs");
    if (activeNav === "management") return t("controls");
    return t("userManagement");
  };

  useEffect(() => {
    setUserPage(1);
  }, [activeNav, search]);

  useEffect(() => {
    if (userPage > totalUserPages) setUserPage(totalUserPages);
  }, [userPage, totalUserPages]);

  return (
    <div className="container">
      <aside className="sidebar">
        <div className="superadmin-brand">
          <img src="/Logo.png" alt="Snehalaya logo" />
          <div>
            <p>MCQ Test Portal</p>
            <h2>{t("superAdmin")}</h2>
          </div>
        </div>

        <nav>
          <button
            type="button"
            className={activeNav === "dashboard" ? "active" : ""}
            onClick={() => { setActiveNav("dashboard"); setSearch(""); }}
          >
            🏠 {t("dashboardNav")}
          </button>
          <button
            type="button"
            className={activeNav === "Candidates" ? "active" : ""}
            onClick={() => { setActiveNav("Candidates"); setSearch(""); }}
          >
            🎓 {t("candidates")}
          </button>
          <button
            type="button"
            className={activeNav === "administrators" ? "active" : ""}
            onClick={() => { setActiveNav("administrators"); setSearch(""); }}
          >
            🛡️ {t("administrators")}
          </button>
          <button
            type="button"
            className={activeNav === "reports" ? "active" : ""}
            onClick={() => { setActiveNav("reports"); setSearch(""); }}
          >
            📊 {t("reports")}
          </button>
          <button
            type="button"
            className={activeNav === "management" ? "active" : ""}
            onClick={() => { setActiveNav("management"); setSearch(""); }}
          >
            🧩 {t("controls")}
          </button>
          <button
            type="button"
            className={activeNav === "activity" ? "active" : ""}
            onClick={() => { setActiveNav("activity"); setSearch(""); }}
          >
            {t("activityLogs")}
          </button>
          <button type="button" onClick={logout}>
            🚪 {t("logout")}
          </button>
        </nav>
      </aside>

      <main className="main-content">
        <div className="superadmin-toolbar">
          <LanguageSwitcher />
        </div>

        {activeNav === "dashboard" && (
          <section className="welcome-card">
            <div>
              <h1>{t("welcomeSuperAdmin")}</h1>
              <p>{t("welcomeSuperAdminText")}</p>
            </div>
          </section>
        )}

        {activeNav === "dashboard" && (
          <section className="stats-grid">
            <div className="stat-card stat-card-with-icon" onClick={() => setActiveNav("Candidates")} style={{ cursor: "pointer" }}>
              <h3>{t("totalUsers")}</h3>
              <h2>{displayStats.totalUsers}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>{t("clickToView")}</p>
            </div>
            <div className="stat-card stat-card-with-icon" onClick={() => setActiveNav("Candidates")} style={{ cursor: "pointer" }}>
              <h3>{t("activeUsers")}</h3>
              <h2>{displayStats.activeUsers}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>{t("clickToView")}</p>
            </div>
            <div className="stat-card stat-card-with-icon" onClick={() => setActiveNav("administrators")} style={{ cursor: "pointer" }}>
              <h3>{t("administrators")}</h3>
              <h2>{displayStats.administrators}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>{t("clickToView")}</p>
            </div>
            <div className="stat-card stat-card-with-icon">
              <h3>{t("assessments")}</h3>
              {/* ✅ Fixed: backend returns totalAssessments not assessments */}
              <h2>{displayStats.totalAssessments}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>{t("totalSubmitted")}</p>
            </div>
          </section>
        )}

        {activeNav === "reports" && (
          <section className="card">
            <div className="section-header">
              <h2>📊 Reports</h2>
              <input
                type="text"
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                placeholder="Search reports..."
              />
            </div>

            <div className="report-toolbar">
              <div>
                <h3>{filteredReports.length}</h3>
                <p>submissions shown</p>
              </div>
              <div className="report-actions">
                <button type="button" onClick={() => saveReportsPDF(filteredReports, suitesById, "summary")}>Summary PDF</button>
                <button type="button" onClick={() => saveReportsExcel(filteredReports, suitesById, "summary")}>Summary Excel</button>
                <button type="button" onClick={() => saveReportsPDF(filteredReports, suitesById, "descriptive")}>Descriptive PDF</button>
                <button type="button" onClick={() => saveReportsExcel(filteredReports, suitesById, "descriptive")}>Descriptive Excel</button>
              </div>
            </div>

            {reportsLoading ? (
              <p className="empty-message">Loading reports...</p>
            ) : (
              <div className="table-wrapper reports-table-wrapper">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Test Name</th>
                      <th>Candidate</th>
                      <th>Email</th>
                      <th>Project/Department</th>
                      <th>Designation</th>
                      <th>Score</th>
                      <th>%</th>
                      <th>Result</th>
                      <th>Attempted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map(result => (
                      <tr key={result._id}>
                        <td>{resultTestName(result, suitesById)}</td>
                        <td>{candidateName(result)}</td>
                        <td>{candidateEmail(result)}</td>
                        <td>{result.project || "-"}</td>
                        <td>{result.designation || "-"}</td>
                        <td>{result.score || 0}/{result.totalMarks || 0}</td>
                        <td>{resultPct(result)}%</td>
                        <td>
                          <span className={`badge ${resultStatus(result) === "Pass" ? "active" : "disabled"}`}>
                            {resultStatus(result)}
                          </span>
                        </td>
                        <td>{formatDateTime(result.submittedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredReports.length === 0 && <p className="empty-message">No reports found.</p>}
              </div>
            )}
          </section>
        )}

        {activeNav === "activity" && (
          <section className="card">
            <div className="section-header">
              <div>
                <h2>Activity Logs</h2>
                <p>Successful changes made by candidates, administrators, and super admins.</p>
              </div>
              <button type="button" className="refresh-btn" onClick={() => loadActivityLogs()}>Refresh</button>
            </div>
            <form className="activity-filters" onSubmit={(event) => { event.preventDefault(); loadActivityLogs(); }}>
              <input
                type="text"
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                placeholder="Search admin, action, project, department..."
              />
              <label>
                From
                <input type="date" value={activityFromDate} onChange={(e) => setActivityFromDate(e.target.value)} />
              </label>
              <label>
                To
                <input type="date" value={activityToDate} onChange={(e) => setActivityToDate(e.target.value)} />
              </label>
              <button type="submit">Search</button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setActivitySearch("");
                  setActivityFromDate("");
                  setActivityToDate("");
                  loadActivityLogs({ search: "", from: "", to: "" });
                }}
              >
                Clear
              </button>
              <button type="button" onClick={() => loadActivityLogs()}>Refresh</button>
            </form>
            {activityLoading ? <p className="empty-message">Loading activity…</p> : (
              <div className="table-wrapper activity-table-wrapper">
                <table className="activity-table">
                  <thead><tr><th>Date & Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Details</th></tr></thead>
                  <tbody>{activityLogs.map(log => (
                    <tr key={log._id}>
                      <td>{formatDateTime(log.occurredAt || log.createdAt)}</td>
                      <td>{log.actorName || "System"}</td>
                      <td>{log.actorRole || "-"}</td>
                      <td>{readableActivityAction(log)}</td>
                      <td>
                        {[log.details?.name, log.details?.email, log.details?.project, log.details?.designation]
                          .filter(Boolean)
                          .join(" • ") || "-"}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                {activityLogs.length === 0 && <p className="empty-message">No recorded activity yet.</p>}
              </div>
            )}
          </section>
        )}

        {activeNav === "management" && (
          <section className="card controls-card">
            <div className="section-header">
              <h2>🧩 Controls</h2>
            </div>

            <div className="control-tabs" role="tablist" aria-label="Super admin controls">
              {CONTROL_MODES.map(mode => (
                <button
                  key={mode.key}
                  type="button"
                  role="tab"
                  aria-selected={controlMode === mode.key}
                  className={controlMode === mode.key ? "active" : ""}
                  onClick={() => setControlMode(mode.key)}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {controlMode === "rights" && (
              <div className="rights-console">
                <div className="rights-filters">
                  <select value={rightsUserId} onChange={e => handleRightsUserChange(e.target.value)}>
                    <option value="">Select admin</option>
                    {adminUsers.map(user => (
                      <option key={user._id} value={user._id}>
                        {user.name} - {user.customRole || user.role}
                      </option>
                    ))}
                  </select>
                  <select value={rightsProject} onChange={e => setRightsProject(e.target.value)}>
                    <option value="">All project/departments</option>
                    {Object.keys(orgOptions).sort((a, b) => a.localeCompare(b)).map(project => (
                      <option key={project} value={project}>{project}</option>
                    ))}
                  </select>
                  <button type="button" onClick={saveAdminRights} disabled={rightsSaving || !rightsUserId}>
                    {rightsSaving ? "Saving..." : "Save Rights"}
                  </button>
                </div>

                {selectedRightsUser && (
                  <div className="rights-scope-card">
                    <div>
                      <strong>{selectedRightsUser.name}</strong>
                      <span>{selectedRightsUser.email || selectedRightsUser.mobile || selectedRightsUser.username}</span>
                    </div>
                    <p>
                      Project/Department scope: {rightsProject || "All project/departments"} · Designation scope: {rightsForm.scopeDepartments.length ? rightsForm.scopeDepartments.join(", ") : "All designations"}
                    </p>
                  </div>
                )}

                {rightsProject && (
                  <div className="rights-departments">
                    <span>Designations</span>
                    {rightsDepartments.length === 0 ? (
                      <p>No designations found for this project/department.</p>
                    ) : rightsDepartments.map(department => (
                      <button
                        key={department}
                        type="button"
                        className={rightsForm.scopeDepartments.includes(department) ? "selected" : ""}
                        onClick={() => toggleRightsDepartment(department)}
                      >
                        {rightsForm.scopeDepartments.includes(department) ? "✓" : "×"} {department}
                      </button>
                    ))}
                  </div>
                )}

                <div className="custom-right-maker">
                  <div>
                    <strong>Make New Right</strong>
                    <span>Create an extra right row, then allow or deny it for the selected admin.</span>
                  </div>
                  <input
                    value={customRightForm.label}
                    onChange={e => setCustomRightForm(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="Right name"
                  />
                  <input
                    value={customRightForm.detail}
                    onChange={e => setCustomRightForm(prev => ({ ...prev, detail: e.target.value }))}
                    placeholder="Right details"
                  />
                  <button type="button" onClick={addCustomRight}>＋ Add Right</button>
                </div>

                <div className="rights-table-wrap">
                  <table className="rights-table">
                    <thead>
                      <tr>
                        <th>Feature</th>
                        <th>Details</th>
                        <th>Allowed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rightsRows.map(right => {
                        const allowed = rightsForm.permissions[right.key] !== false;
                        return (
                          <tr key={right.key}>
                            <td>
                              {right.label}
                              {right.custom && <span className="custom-right-badge">custom</span>}
                            </td>
                            <td>{right.detail}</td>
                            <td>
                              <button
                                type="button"
                                className={`rights-toggle ${allowed ? "allowed" : "blocked"}`}
                                onClick={() => toggleRight(right.key)}
                                disabled={!rightsUserId}
                                title={allowed ? "Allowed" : "Blocked"}
                              >
                                {allowed ? "✓" : "×"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {controlMode === "roles" && (
              <div className="control-grid controls-roles-grid">
                <div className="control-panel wide controls-user-panel">
                  <h3>Create User Account</h3>
                  <div className="control-form-grid controls-user-grid">
                    <input
                      value={createUserForm.firstName}
                      onChange={e => updateCreateUserForm("firstName", e.target.value)}
                      placeholder="First name"
                    />
                    <input
                      value={createUserForm.middleName}
                      onChange={e => updateCreateUserForm("middleName", e.target.value)}
                      placeholder="Middle name"
                    />
                    <input
                      value={createUserForm.lastName}
                      onChange={e => updateCreateUserForm("lastName", e.target.value)}
                      placeholder="Last name"
                    />
                    <input
                      type="email"
                      value={createUserForm.email}
                      onChange={e => updateCreateUserForm("email", e.target.value)}
                      placeholder="Email address"
                    />
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={createUserForm.age}
                      onChange={e => updateCreateUserForm("age", e.target.value)}
                      placeholder="Age"
                    />
                    <select value={createUserForm.gender} onChange={e => updateCreateUserForm("gender", e.target.value)}>
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                    <select className="span-2" value={createUserForm.project} onChange={e => updateCreateUserForm("project", e.target.value)}>
                      <option value="">Select project/department</option>
                      {createUserProjectNames.map(project => (
                        <option key={project} value={project}>{project}</option>
                      ))}
                    </select>
                    <select value={createUserForm.contactType} onChange={e => updateCreateUserForm("contactType", e.target.value)}>
                      <option value="email">Use email</option>
                      <option value="mobile">Use mobile number</option>
                    </select>
                    <input
                      value={createUserForm.username}
                      onChange={e => updateCreateUserForm("username", e.target.value)}
                      placeholder="Preferred contact / username"
                    />
                    <select value={createUserForm.role} onChange={e => updateCreateUserForm("role", e.target.value)}>
                      <option value="">Assign role</option>
                      {assignableRoles.map(role => (
                        <option key={role.name} value={role.name}>
                          {role.name}{role.system ? " (system)" : ""}
                        </option>
                      ))}
                    </select>
                    {createUserForm.contactType === "mobile" && (
                      <input
                        type="tel"
                        value={createUserForm.mobile}
                        onChange={e => updateCreateUserForm("mobile", e.target.value)}
                        placeholder="Mobile number"
                      />
                    )}
                    <input
                      type="password"
                      value={createUserForm.password}
                      onChange={e => updateCreateUserForm("password", e.target.value)}
                      placeholder="Password"
                    />
                    <input
                      type="password"
                      value={createUserForm.confirmPassword}
                      onChange={e => updateCreateUserForm("confirmPassword", e.target.value)}
                      placeholder="Confirm password"
                    />
                    <select
                      value={createUserForm.designation}
                      onChange={e => updateCreateUserForm("designation", e.target.value)}
                      disabled={!createUserForm.project}
                    >
                      <option value="">{createUserForm.project ? "Select designation" : "Select project/department first"}</option>
                      {createUserDepartments.map(department => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                    <select value={createUserForm.isActive ? "active" : "disabled"} onChange={e => updateCreateUserForm("isActive", e.target.value === "active")}>
                      <option value="active">Status: Active</option>
                      <option value="disabled">Status: Disabled</option>
                    </select>
                  </div>
                  <button type="button" onClick={createUserAccount} disabled={creatingUser}>
                    {creatingUser ? "Creating..." : "Create User"}
                  </button>
                </div>

                <div className="control-panel wide controls-user-panel" id="edit-user-card">
                  <h3>Edit Existing User</h3>
                  <p className="control-panel-note">Search and update the details of an existing user.</p>
                  <div className="control-form-grid controls-edit-search">
                    <input
                      value={editUserSearch}
                      onChange={e => setEditUserSearch(e.target.value)}
                      placeholder="Search user by name, email, role, project..."
                    />
                    <select value={editUserId} onChange={e => handleEditUserChange(e.target.value)}>
                      <option value="">Select user to edit</option>
                      {editUserOptions.length === 0 && <option value="" disabled>No users found</option>}
                      {editUserOptions.map(user => (
                        <option key={user._id} value={user._id}>
                          {userOptionLabel(user)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="control-form-grid controls-user-grid">
                    <input
                      value={editUserForm.firstName}
                      onChange={e => updateEditUserForm("firstName", e.target.value)}
                      placeholder="First name"
                      disabled={!editUserId}
                    />
                    <input
                      value={editUserForm.middleName}
                      onChange={e => updateEditUserForm("middleName", e.target.value)}
                      placeholder="Middle name"
                      disabled={!editUserId}
                    />
                    <input
                      value={editUserForm.lastName}
                      onChange={e => updateEditUserForm("lastName", e.target.value)}
                      placeholder="Last name"
                      disabled={!editUserId}
                    />
                    <input
                      type="email"
                      value={editUserForm.email}
                      onChange={e => updateEditUserForm("email", e.target.value)}
                      placeholder="Email address"
                      disabled={!editUserId || editUserForm.contactType !== "email"}
                    />
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={editUserForm.age}
                      onChange={e => updateEditUserForm("age", e.target.value)}
                      placeholder="Age"
                      disabled={!editUserId}
                    />
                    <select value={editUserForm.gender} onChange={e => updateEditUserForm("gender", e.target.value)} disabled={!editUserId}>
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                    <select className="span-2" value={editUserForm.project} onChange={e => updateEditUserForm("project", e.target.value)} disabled={!editUserId}>
                      <option value="">Select project/department</option>
                      {createUserProjectNames.map(project => (
                        <option key={project} value={project}>{project}</option>
                      ))}
                    </select>
                    <select value={editUserForm.contactType} onChange={e => updateEditUserForm("contactType", e.target.value)} disabled={!editUserId}>
                      <option value="email">Preferred contact: email</option>
                      <option value="mobile">Preferred contact: mobile</option>
                    </select>
                    {editUserForm.contactType === "mobile" ? (
                      <input
                        type="tel"
                        value={editUserForm.mobile}
                        onChange={e => updateEditUserForm("mobile", e.target.value)}
                        placeholder="Mobile number"
                        disabled={!editUserId}
                      />
                    ) : (
                      <input
                        value={editUserForm.alternateEmail}
                        onChange={e => updateEditUserForm("alternateEmail", e.target.value)}
                        placeholder="Alternate email (optional)"
                        disabled={!editUserId}
                      />
                    )}
                    <select value={editUserForm.role} onChange={e => updateEditUserForm("role", e.target.value)} disabled={!editUserId}>
                      <option value="">Assign role</option>
                      {editRoleOptions.map(role => (
                        <option key={role.name} value={role.name}>
                          {role.name}{role.system ? " (system)" : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editUserForm.isActive ? "active" : "disabled"}
                      onChange={e => updateEditUserForm("isActive", e.target.value === "active")}
                      disabled={!editUserId}
                    >
                      <option value="active">Active account</option>
                      <option value="disabled">Disabled account</option>
                    </select>
                    <select
                      value={editUserForm.designation}
                      onChange={e => updateEditUserForm("designation", e.target.value)}
                      disabled={!editUserId || !editUserForm.project}
                    >
                      <option value="">{editUserForm.project ? "Select designation" : "Select project/department first"}</option>
                      {editUserDepartments.map(department => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                    <input
                      value={editUserForm.username}
                      onChange={e => updateEditUserForm("username", e.target.value)}
                      placeholder="Preferred contact / username"
                      disabled={!editUserId}
                    />
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={editUserForm.resetPassword}
                        onChange={e => updateEditUserForm("resetPassword", e.target.checked)}
                        disabled={!editUserId}
                      />
                      Reset password
                    </label>
                    {editUserForm.resetPassword && (
                      <input
                        type="password"
                        value={editUserForm.newPassword}
                        onChange={e => updateEditUserForm("newPassword", e.target.value)}
                        placeholder="New password"
                        disabled={!editUserId}
                      />
                    )}
                  </div>
                  <button type="button" onClick={saveEditedUser} disabled={savingEditUser || !editUserId}>
                    {savingEditUser ? "Saving..." : "Save User Changes"}
                  </button>
                </div>

                <div className="role-card-row">
                  <div className="control-panel role-card">
                    <h3>Create New Role</h3>
                    <input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="Role name" />
                    <select value={roleForm.baseRole} onChange={e => setRoleForm({ ...roleForm, baseRole: e.target.value })}>
                      <option value="candidate">Candidate-level access</option>
                      <option value="admin">Admin-level access</option>
                    </select>
                    <textarea value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="Role description" rows={3} />
                    <button type="button" onClick={createRole}>Create Role</button>
                  </div>

                  <div className="control-panel role-card">
                    <h3>Add People To Role</h3>
                    <input
                      value={assignUserSearch}
                      onChange={e => setAssignUserSearch(e.target.value)}
                      placeholder="Search user by name, email, role, project..."
                    />
                    <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
                      <option value="">Select user</option>
                      {assignUserOptions.length === 0 && <option value="" disabled>No users found</option>}
                      {assignUserOptions.map(user => (
                        <option key={user._id} value={user._id}>
                          {userOptionLabel(user)}
                        </option>
                      ))}
                    </select>
                    <select value={assignRole} onChange={e => setAssignRole(e.target.value)}>
                      {assignableRoles.map(role => <option key={role.name} value={role.name}>{role.name}</option>)}
                    </select>
                    <button type="button" onClick={assignUserRole}>Assign Role</button>
                    <div className="mini-list">
                      {assignableRoles.map(role => (
                        <span key={role.name}>{role.name}{role.system ? " (system)" : ""}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {controlMode === "org" && (
              <div className="control-grid">
                <div className="control-panel">
                  <h3>Add Project/Department</h3>
                  <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Project/Department name" />
                  <button type="button" onClick={addProject}>Add Project/Department</button>
                </div>

                <div className="control-panel">
                  <h3>Add Designation</h3>
                  <select value={departmentProject} onChange={e => setDepartmentProject(e.target.value)}>
                    <option value="">Select project/department</option>
                    {createUserProjectNames.map(project => (
                      <option key={project} value={project}>{project}</option>
                    ))}
                  </select>
                  <input value={departmentName} onChange={e => setDepartmentName(e.target.value)} placeholder="Designation name" />
                  <button type="button" onClick={addDepartment}>Add Designation</button>
                </div>

                <div className="control-panel">
                  <h3>Edit Project/Department</h3>
                  <select
                    value={editProjectOriginal}
                    onChange={e => {
                      setEditProjectOriginal(e.target.value);
                      setEditProjectName(e.target.value);
                    }}
                  >
                    <option value="">Select project/department</option>
                    {createUserProjectNames.map(project => (
                      <option key={project} value={project}>{project}</option>
                    ))}
                  </select>
                  <input
                    value={editProjectName}
                    onChange={e => setEditProjectName(e.target.value)}
                    placeholder="Updated project/department name"
                    disabled={!editProjectOriginal}
                  />
                  <button type="button" onClick={updateProject} disabled={!editProjectOriginal}>Update Project/Department</button>
                </div>

                <div className="control-panel">
                  <h3>Edit Designation</h3>
                  <select
                    value={editDepartmentProject}
                    onChange={e => {
                      setEditDepartmentProject(e.target.value);
                      setEditDepartmentOriginal("");
                      setEditDepartmentName("");
                    }}
                  >
                    <option value="">Select project/department</option>
                    {createUserProjectNames.map(project => (
                      <option key={project} value={project}>{project}</option>
                    ))}
                  </select>
                  <select
                    value={editDepartmentOriginal}
                    onChange={e => {
                      setEditDepartmentOriginal(e.target.value);
                      setEditDepartmentName(e.target.value);
                    }}
                    disabled={!editDepartmentProject}
                  >
                    <option value="">{editDepartmentProject ? "Select designation" : "Select project/department first"}</option>
                    {editDepartmentOptions.map(department => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                  <input
                    value={editDepartmentName}
                    onChange={e => setEditDepartmentName(e.target.value)}
                    placeholder="Updated designation name"
                    disabled={!editDepartmentOriginal}
                  />
                  <button type="button" onClick={updateDepartment} disabled={!editDepartmentOriginal}>Update Designation</button>
                </div>

                <div className="control-panel wide">
                  <h3>Current Project/Departments</h3>
                  <div className="project-list">
                    {Object.entries(orgOptions).sort(([a], [b]) => a.localeCompare(b)).map(([project, departments]) => (
                      <details key={project}>
                        <summary>
                          <span className="project-title">{project}</span>
                          <span>{departments.length} designations</span>
                          <button type="button" className="project-delete-btn" onClick={e => { e.preventDefault(); e.stopPropagation(); deleteProject(project); }}>
                            Delete
                          </button>
                        </summary>
                        <div>
                          {departments.length === 0 ? (
                            <p>No designations added.</p>
                          ) : departments.map(dept => (
                            <span key={dept} className="department-chip">
                              {dept}
                              <button type="button" onClick={() => deleteDepartment(project, dept)} aria-label={`Delete ${dept}`}>×</button>
                            </span>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {controlMode === "mail" && <BulkMailPanel />}
          </section>
        )}

        {(activeNav === "dashboard" || activeNav === "Candidates" || activeNav === "administrators") && (
          <section className={`card users-card ${activeNav === "Candidates" ? "users-card-green" : ""}`} id="users">
            <div className="section-header">
              <h2>{getSectionTitle()}</h2>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchUsers")}
              />
            </div>

            {error && <p className="error-message">{error}</p>}

            <div className="table-wrapper">
              <table className="user-management-table">
                <thead>
                  <tr>
                    <th>{t("serialNumber")}</th>
                    <th>{t("name")}</th>
                    <th>{t("email")}</th>
                    <th>{t("projectDepartment")}</th>
                    <th>{t("designation")}</th>
                    <th>{t("role")}</th>
                    <th>{t("status")}</th>
                    <th>{t("access")}</th>
                    <th>{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((user, index) => (
                    <tr key={user._id}>
                      <td className="serial-cell">{userPageStart + index}</td>
                      <td>{user.name}</td>
                      <td>{user.email || user.mobile || user.username || "—"}</td>
                      <td>
                        <span className="user-org-text">{user.project || "—"}</span>
                      </td>
                      <td>
                        <span className="user-org-text">{user.designation || "—"}</span>
                      </td>
                      <td>
                        <span className={`badge ${user.role === "candidate" ? "Candidate" : "admin"}`}>
                          {user.customRole || user.role}
                        </span>
                      </td>
                      <td>{user.isActive ? t("active") : t("disabled")}</td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={user.isActive}
                            onChange={(e) => updateAccess(user._id, e.target.checked)}
                          />
                          <span className="slider"></span>
                        </label>
                      </td>
                      <td>
                        <div className="user-actions">
                          <button
                            type="button"
                            className="icon-action-btn"
                            onClick={() => openEditUser(user)}
                            aria-label={`Edit ${user.name}`}
                            title="Edit user"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="icon-action-btn"
                            onClick={() => openResetPassword(user)}
                            aria-label={`Reset password for ${user.name}`}
                            title="Reset password"
                          >
                            ↻
                          </button>
                          <button
                            type="button"
                            className="icon-action-btn danger"
                            onClick={() => deleteUserAccount(user)}
                            disabled={user._id === currentUser?._id}
                            aria-label={`Delete ${user.name}`}
                            title={user._id === currentUser?._id ? "You cannot delete your own account" : "Delete user"}
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredUsers.length > USERS_PER_PAGE && (
              <div className="table-pagination">
                <span>
                  {t("showingUsers", { from: userPageStart, to: userPageEnd, total: filteredUsers.length })}
                </span>
                <div>
                  <button type="button" onClick={() => setUserPage(page => Math.max(1, page - 1))} disabled={safeUserPage === 1}>
                    {t("previous")}
                  </button>
                  <strong>{t("pageOf", { page: safeUserPage, pages: totalUserPages })}</strong>
                  <button type="button" onClick={() => setUserPage(page => Math.min(totalUserPages, page + 1))} disabled={safeUserPage === totalUserPages}>
                    {t("nextPage")}
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && filteredUsers.length === 0 && (
              <p className="empty-message">No users found.</p>
            )}
            {loading && <p className="empty-message">Loading users...</p>}
          </section>
        )}

      </main>

      {resetUser && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
            <h2 id="reset-password-title">Reset Password</h2>
            <p>
              Set a temporary password for <strong>{resetUser.name}</strong>
              <span>{resetUser.email}</span>
            </p>
            <label htmlFor="temporary-password">Temporary password</label>
            <input
              id="temporary-password"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              autoFocus
            />
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setResetUser(null)}>
                Cancel
              </button>
              <button type="button" onClick={resetUserPassword} disabled={resetSaving}>
                {resetSaving ? "Saving..." : "Save Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdmin;
