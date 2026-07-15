// src/pages/TestSuiteDetail.jsx
import { useCallback, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { canAdmin, getAuthHeaders, getCurrentUser } from "../utils/auth";
import LanguageSwitcher from "../components/LanguageSwitcher";
import "./testSuiteDetail.css";

const API        = import.meta.env.VITE_API_URL || "";
const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";
const QUESTION_IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;
const QUESTION_VIDEO_MAX_BYTES = 8 * 1024 * 1024;

const emptyForm = {
  questionText:   "",
  imageUrl:       "",
  videoUrl:       "",
  questionType:   "mcq",
  options:        ["", "", "", ""],
  correctAnswers: [],
  optionScores:   ["", "", "", ""],
  categoryCorrectAnswers: {},
  explanation:    "",
  marks:          1,
  categories:     [],
};

function getCategoryAnswerMap(q) {
  if (!q?.categoryCorrectAnswers) return {};
  if (q.categoryCorrectAnswers instanceof Map) return Object.fromEntries(q.categoryCorrectAnswers);
  return q.categoryCorrectAnswers;
}

function uniqueSortedIndexes(indexes) {
  return [...new Set((Array.isArray(indexes) ? indexes : []).map(Number))]
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

function isTheoryQuestion(q) {
  return q?.questionType === "theory";
}

function sortQuestionsBySuiteOrder(items) {
  return [...(items || [])].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return String(a._id || "").localeCompare(String(b._id || ""));
  });
}

function rowValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return "";
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function parseCorrectAnswerIndexes(value, options) {
  const optionLetters = { a: 0, b: 1, c: 2, d: 3 };
  return [...new Set(splitList(value).map(item => {
    const token = item.toLowerCase();
    if (/^\d+$/.test(token)) return Number(token);
    if (optionLetters[token] !== undefined) return optionLetters[token];
    return options.findIndex(option => option.toLowerCase() === token);
  }))]
    .filter(index => Number.isInteger(index) && index >= 0 && index < options.length);
}

function parseOptionScores(value, optionCount) {
  const scores = splitList(value).map(item => Number(item));
  if (scores.length === 0 || scores.some(score => !Number.isFinite(score))) return [];
  return scores.slice(0, optionCount);
}

function rowScoreValue(row, index) {
  const letters = ["A", "B", "C", "D", "E", "F"];
  const number = index + 1;
  const keys = [
    `option${number}Score`,
    `Option${number}Score`,
    `score${number}`,
    `Score${number}`,
    `${letters[index]}Score`,
    `${letters[index].toLowerCase()}Score`,
    `score${letters[index]}`,
    `Score${letters[index]}`,
  ];
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      const value = Number(row[key]);
      return Number.isFinite(value) ? value : null;
    }
  }
  return null;
}

function parseOptionScoresFromRow(row, options) {
  const direct = parseOptionScores(
    rowValue(row, ["optionScores", "OptionScores", "scores", "Scores"]),
    options.length
  );
  if (direct.length > 0) return direct;
  const perOption = options.map((_, index) => rowScoreValue(row, index));
  return perOption.some(value => value !== null)
    ? perOption.map(value => Number.isFinite(value) ? value : 0)
    : [];
}

function maxScoreIndexes(optionScores) {
  const scores = (Array.isArray(optionScores) ? optionScores : []).map(Number).filter(Number.isFinite);
  if (scores.length === 0) return [];
  const max = Math.max(...scores);
  return scores
    .map((score, index) => score === max && max > 0 ? index : null)
    .filter(Number.isInteger);
}

function normalizedOptionScores(optionScores, optionCount) {
  const scores = (Array.isArray(optionScores) ? optionScores : [])
    .slice(0, optionCount)
    .map(score => Number(score))
    .map(score => Number.isFinite(score) ? score : 0);
  return scores;
}

function hasWeightedOptionScores(optionScores) {
  return (Array.isArray(optionScores) ? optionScores : [])
    .some(score => Number.isFinite(Number(score)));
}

function isQuestionImage(value) {
  const source = String(value || "").trim();
  return source.startsWith("data:image/") || /^https?:\/\/.+/i.test(source);
}

function isQuestionVideo(value) {
  const source = String(value || "").trim();
  return source.startsWith("data:video/") || /^https?:\/\/.+\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(source);
}

function normalizeLanguage(value) {
  const base = String(value || "en").trim().toLowerCase().split(/[-_]/)[0];
  return ["en", "hi", "mr"].includes(base) ? base : "en";
}

function normalizeImportRow(row, rowNum) {
  const questionText = String(rowValue(row, ["questionText", "Question", "question"])).trim();
  const questionType = String(rowValue(row, ["questionType", "QuestionType", "type", "Type"]) || "mcq")
    .trim()
    .toLowerCase() === "theory" ? "theory" : "mcq";
  const options = [
    rowValue(row, ["option1", "Option1", "A"]),
    rowValue(row, ["option2", "Option2", "B"]),
    rowValue(row, ["option3", "Option3", "C"]),
    rowValue(row, ["option4", "Option4", "D"]),
  ].map(value => String(value).trim()).filter(Boolean);
  const category = splitList(rowValue(row, ["category", "Category"]));
  const correctAnswer = parseCorrectAnswerIndexes(
    rowValue(row, ["correctAnswers", "CorrectAnswers", "correctAnswer", "CorrectAnswer", "correct", "answer", "Answer"]),
    options
  );
  const optionScores = parseOptionScoresFromRow(row, options);
  const inferredCorrectAnswer = correctAnswer.length > 0 ? correctAnswer : maxScoreIndexes(optionScores);

  if (!questionText) return { error: `Row ${rowNum}: missing questionText` };
  if (questionType === "mcq" && options.length < 2) return { error: `Row ${rowNum}: need at least 2 options` };
  if (questionType === "mcq" && inferredCorrectAnswer.length === 0) {
    return { error: `Row ${rowNum}: invalid correctAnswers. Use 0-based index, A/B/C/D, or exact option text.` };
  }

  return {
    questionText,
    imageUrl: String(rowValue(row, ["imageUrl", "ImageUrl", "image", "Image", "picture", "Picture"])).trim(),
    videoUrl: String(rowValue(row, ["videoUrl", "VideoUrl", "video", "Video"])).trim(),
    questionType,
    options: questionType === "theory" ? [] : options,
    correctAnswer: questionType === "theory" ? [] : inferredCorrectAnswer,
    optionScores: questionType === "theory" ? [] : optionScores,
    categoryCorrectAnswers: {},
    explanation: String(rowValue(row, ["explanation", "Explanation"])).trim(),
    marks: Number(rowValue(row, ["marks", "Marks"]) || 1) || 1,
    language: String(rowValue(row, ["language", "Language"]) || "en").trim(),
    category,
  };
}

export default function TestSuiteDetail() {
  const { suiteId }               = useParams();
  const navigate                  = useNavigate();
  const { i18n }                  = useTranslation();
  const selectedLanguage          = normalizeLanguage(i18n.resolvedLanguage || i18n.language);
  const currentUser               = getCurrentUser();
  const canViewQuestions          = canAdmin("canViewQuestions", currentUser);
  const canManageSuiteSettings    = canAdmin("canViewSuites", currentUser) && canAdmin("canManageSuites", currentUser);
  const canManageQuestions        = canViewQuestions && canAdmin("canManageQuestions", currentUser);
  const [suite, setSuite]         = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [editingQ, setEditingQ]   = useState(null);
  const [questionSearch, setQuestionSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [showDuration, setShowDuration] = useState(false);
  const [durationVal, setDurationVal]   = useState(30);
  const [submitDelayVal, setSubmitDelayVal] = useState(0);
  const [showResultsAfterSubmission, setShowResultsAfterSubmission] = useState(true);
  const [savingDur, setSavingDur]       = useState(false);

  // Feature 5: Questions to serve
  const [showQtsServe, setShowQtsServe]   = useState(false);
  const [questionMode, setQuestionMode]    = useState("all");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [qtsServeVal, setQtsServeVal]     = useState("");
  const [savingQts, setSavingQts]         = useState(false);

  const [showPassing, setShowPassing] = useState(false);
  const [passingVal, setPassingVal]   = useState(50);
  const [savingPassing, setSavingPassing] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [scoringMode, setScoringMode] = useState("standard");
  const [savingScoring, setSavingScoring] = useState(false);

  // Feature 9: Date window
  const [showDateWindow, setShowDateWindow] = useState(false);
  const [startDate, setStartDate]           = useState("");
  const [endDate, setEndDate]               = useState("");
  const [savingDates, setSavingDates]       = useState(false);

  const [categories, setCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`cats_${suiteId}`)) || []; }
    catch { return []; }
  });
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatInput, setNewCatInput]       = useState("");
  const [catError, setCatError]             = useState("");

  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    localStorage.setItem(`cats_${suiteId}`, JSON.stringify(categories));
  }, [categories, suiteId]);

  const fetchData = useCallback(async () => {
    if (!canViewQuestions) {
      setError("Question viewing permission is disabled for your account.");
      setLoading(false);
      return;
    }
    try {
      const config = { headers: getAuthHeaders() };
      const [suiteRes, qRes] = await Promise.all([
        axios.get(`${API}/api/test-suites/${suiteId}`, config),
        axios.get(`${API}/api/test-suites/${suiteId}/questions`, {
          ...config,
          params: { language: selectedLanguage },
        }),
      ]);
      setSuite(suiteRes.data);
      setDurationVal(suiteRes.data.duration || 30);
      setSubmitDelayVal(suiteRes.data.submitDelayMinutes || 0);
      setShowResultsAfterSubmission(suiteRes.data.showResultsAfterSubmission !== false);
      setQuestionMode(suiteRes.data.questionSelectionMode || (suiteRes.data.selectedQuestionIds?.length ? "selected" : suiteRes.data.questionsToServe ? "random" : "all"));
      setSelectedQuestionIds((suiteRes.data.selectedQuestionIds || []).map(id => String(id?._id || id)));
      setQtsServeVal(suiteRes.data.questionsToServe || "");
      setPassingVal(suiteRes.data.passingPercentage ?? 50);
      setScoringMode(suiteRes.data.scoringMode || "standard");
      // Format dates for datetime-local input
      setStartDate(suiteRes.data.startDate
        ? new Date(suiteRes.data.startDate).toISOString().slice(0, 16) : "");
      setEndDate(suiteRes.data.endDate
        ? new Date(suiteRes.data.endDate).toISOString().slice(0, 16) : "");
      setQuestions(sortQuestionsBySuiteOrder(qRes.data));
      const existingCats = [...new Set(qRes.data.flatMap(q =>
        Array.isArray(q.category) ? q.category : (q.category ? [q.category] : [])
      ))];
      setCategories(prev => [...new Set([...prev, ...existingCats])]);
    } catch (err) {
      console.error("Failed to fetch suite data:", err);
    } finally {
      setLoading(false);
    }
  }, [canViewQuestions, selectedLanguage, suiteId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleImportClick = () => fileInputRef.current?.click();

  const importQuestionsFromExcelInBrowser = async (file) => {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      throw new Error("Excel file is empty or has no data rows.");
    }

    const parsed = rows.map((row, index) => normalizeImportRow(row, index + 2));
    const errors = parsed.filter(row => row.error).map(row => row.error);
    const questionsToImport = parsed.filter(row => !row.error);

    if (questionsToImport.length === 0) {
      throw new Error(["No valid questions found.", ...errors].join("\n"));
    }

    let imported = 0;
    const postErrors = [];
    for (const question of questionsToImport) {
      try {
        await axios.post(`${API}/api/test-suites/${suiteId}/questions`, question, {
          headers: getAuthHeaders(),
        });
        imported += 1;
      } catch (err) {
        postErrors.push(`${question.questionText.slice(0, 60)}: ${err.response?.data?.message || err.message}`);
      }
    }

    return {
      imported,
      skipped: errors.length + postErrors.length,
      errors: [...errors, ...postErrors],
    };
  };

  const handleDownloadImportTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = [
      "questionText",
      "imageUrl",
      "videoUrl",
      "option1",
      "option2",
      "option3",
      "option4",
      "correctAnswers",
      "optionScores",
      "option1Score",
      "option2Score",
      "option3Score",
      "explanation",
      "marks",
      "category",
      "language",
      "questionType",
    ];
    const example = [
      "What is 2+2?",
      "https://example.com/question-image.png",
      "https://example.com/question-video.mp4",
      "3",
      "4",
      "5",
      "6",
      "1",
      "0,1,0",
      "",
      "",
      "",
      "4 is the correct answer.",
      "1",
      "Confidence",
      "en",
      "mcq",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map(header => ({ wch: Math.max(16, header.length + 4) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "question_import_format.xlsx");
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (!isExcel) {
      alert("Please upload an Excel file only (.xlsx or .xls).");
      e.target.value = "";
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      let importResult = null;
      try {
        const response = await axios.post(`${API}/api/test-suites/${suiteId}/import-excel`, formData, {
          headers: getAuthHeaders({ "Content-Type": "multipart/form-data" }),
        });
        importResult = response.data;
      } catch (err) {
        const status = err.response?.status;
        if (status !== 404 && status < 500) throw err;
        importResult = await importQuestionsFromExcelInBrowser(file);
      }
      await fetchData();
      const errors = Array.isArray(importResult?.errors) ? importResult.errors : [];
      const details = errors.length
        ? `\n\nSkipped ${importResult.skipped || errors.length} row(s):\n${errors.slice(0, 5).join("\n")}`
        : "";
      alert(`Questions imported successfully: ${importResult?.imported ?? 0}${details}`);
    } catch (err) {
      const serverMessage = err.response?.data?.message;
      const serverDetail = err.response?.data?.error;
      const rowErrors = Array.isArray(err.response?.data?.errors) ? err.response.data.errors.slice(0, 5) : [];
      alert([serverMessage, serverDetail, ...rowErrors].filter(Boolean).join("\n") || err.message || "Import failed");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleSaveDuration = async () => {
    if (!durationVal || durationVal < 1) return alert("Please enter a valid duration");
    const submitDelay = Number(submitDelayVal) || 0;
    if (submitDelay < 0) return alert("Submit button delay cannot be negative.");
    if (submitDelay > Number(durationVal)) return alert("Submit button delay cannot be greater than the test duration.");
    setSavingDur(true);
    try {
      await axios.put(`${API}/api/test-suites/${suiteId}`,
        { duration: Number(durationVal), submitDelayMinutes: submitDelay, showResultsAfterSubmission },
        { headers: getAuthHeaders() }
      );
      setSuite(prev => ({ ...prev, duration: Number(durationVal), submitDelayMinutes: submitDelay, showResultsAfterSubmission }));
      setShowDuration(false);
      alert("Duration, submit timing, and result visibility saved!");
    } catch { alert("Failed to save duration"); }
    finally { setSavingDur(false); }
  };

  const toggleSelectedQuestion = (questionId) => {
    setSelectedQuestionIds(prev =>
      prev.includes(questionId)
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    );
  };

  // Feature 5: Save candidate question set
  const handleSaveQtsServe = async () => {
    setSavingQts(true);
    try {
      const mode = ["all", "random", "selected"].includes(questionMode) ? questionMode : "all";
      const value = qtsServeVal ? Number(qtsServeVal) : null;
      if (mode === "random" && (!value || value < 1 || value > questions.length)) {
        setSavingQts(false);
        return alert(`Enter a random question count between 1 and ${questions.length}.`);
      }
      if (mode === "selected" && selectedQuestionIds.length === 0) {
        setSavingQts(false);
        return alert("Select at least one question for the candidate set.");
      }
      const payload = {
        questionSelectionMode: mode,
        questionsToServe: mode === "random" ? value : null,
        selectedQuestionIds: mode === "selected" ? selectedQuestionIds : [],
      };
      await axios.put(`${API}/api/test-suites/${suiteId}`,
        payload,
        { headers: getAuthHeaders() }
      );
      setSuite(prev => ({ ...prev, ...payload }));
      setShowQtsServe(false);
      if (mode === "random") alert(`Candidates will receive ${value} random question(s).`);
      else if (mode === "selected") alert(`Candidates will receive the ${selectedQuestionIds.length} selected question(s).`);
      else alert("Candidates will receive all questions.");
    } catch { alert("Failed to save."); }
    finally { setSavingQts(false); }
  };

  const handleSavePassing = async () => {
    const value = Number(passingVal);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return alert("Please enter a passing percentage between 0 and 100.");
    }
    setSavingPassing(true);
    try {
      await axios.put(`${API}/api/test-suites/${suiteId}`,
        { passingPercentage: value },
        { headers: getAuthHeaders() }
      );
      setSuite(prev => ({ ...prev, passingPercentage: value }));
      setShowPassing(false);
      alert(`Passing criteria saved at ${value}%.`);
    } catch {
      alert("Failed to save passing criteria.");
    } finally {
      setSavingPassing(false);
    }
  };

  const handleSaveScoring = async () => {
    setSavingScoring(true);
    try {
      const payload = { scoringMode: scoringMode === "sixteen_pf" ? "sixteen_pf" : "standard" };
      await axios.put(`${API}/api/test-suites/${suiteId}`,
        payload,
        { headers: getAuthHeaders() }
      );
      setSuite(prev => ({ ...prev, ...payload }));
      setShowScoring(false);
      alert(payload.scoringMode === "sixteen_pf" ? "16PF scoring enabled for this suite." : "Standard MCQ scoring enabled.");
    } catch {
      alert("Failed to save scoring mode.");
    } finally {
      setSavingScoring(false);
    }
  };

  // Feature 9: Save date window
  const handleSaveDates = async () => {
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return alert("End date must be after start date.");
    }
    setSavingDates(true);
    try {
      await axios.put(`${API}/api/test-suites/${suiteId}`,
        {
          startDate: startDate || null,
          endDate:   endDate   || null,
        },
        { headers: getAuthHeaders() }
      );
      setSuite(prev => ({ ...prev, startDate, endDate }));
      setShowDateWindow(false);
      alert("Availability window saved!");
    } catch { alert("Failed to save dates."); }
    finally { setSavingDates(false); }
  };

  const handleAddCategory = () => {
    const name = newCatInput.trim();
    if (!name) { setCatError("Category name cannot be empty"); return; }
    if (categories.includes(name)) { setCatError("Category already exists"); return; }
    setCategories(prev => [...prev, name]);
    setNewCatInput("");
    setCatError("");
  };

  const handleDeleteCategory = (cat) => {
    const used = questions.some(q => (Array.isArray(q.category) ? q.category : [q.category]).includes(cat));
    if (used && !window.confirm(`"${cat}" is used by some questions. Remove anyway?`)) return;
    setCategories(prev => prev.filter(c => c !== cat));
    setForm(f => {
      const nextMap = { ...(f.categoryCorrectAnswers || {}) };
      delete nextMap[cat];
      return { ...f, categories: f.categories.filter(c => c !== cat), categoryCorrectAnswers: nextMap };
    });
  };

  const toggleCategory = (cat) => {
    setForm(f => {
      const selected = f.categories.includes(cat);
      const nextMap = { ...(f.categoryCorrectAnswers || {}) };
      if (selected) {
        delete nextMap[cat];
      } else if (!nextMap[cat]) {
        nextMap[cat] = uniqueSortedIndexes(f.correctAnswers);
      }
      return {
        ...f,
        categories: selected
          ? f.categories.filter(c => c !== cat)
          : [...f.categories, cat],
        categoryCorrectAnswers: nextMap,
      };
    });
  };

  const toggleCorrectAnswer = (index) => {
    setForm(f => ({
      ...f,
      correctAnswers: f.correctAnswers.includes(index)
        ? f.correctAnswers.filter(i => i !== index)
        : [...f.correctAnswers, index],
    }));
  };

  const toggleCategoryCorrectAnswer = (cat, index) => {
    setForm(f => {
      const current = Array.isArray(f.categoryCorrectAnswers?.[cat])
        ? f.categoryCorrectAnswers[cat]
        : [];
      const nextAnswers = current.includes(index)
        ? current.filter(i => i !== index)
        : [...current, index];
      return {
        ...f,
        categoryCorrectAnswers: {
          ...(f.categoryCorrectAnswers || {}),
          [cat]: uniqueSortedIndexes(nextAnswers),
        },
      };
    });
  };

  const handleOptionChange = (index, value) => {
    const opts = [...form.options];
    opts[index] = value;
    setForm({ ...form, options: opts });
  };

  const handleOptionScoreChange = (index, value) => {
    const scores = [...(form.optionScores || [])];
    scores[index] = value;
    setForm({ ...form, optionScores: scores });
  };

  const handleQuestionImageFile = (file) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > QUESTION_IMAGE_MAX_BYTES) {
      setError("Question picture must be under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm(f => ({ ...f, imageUrl: String(reader.result || "") }));
    };
    reader.onerror = () => setError("Unable to read the selected image.");
    reader.readAsDataURL(file);
  };

  const handleQuestionVideoFile = (file) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file.");
      return;
    }
    if (file.size > QUESTION_VIDEO_MAX_BYTES) {
      setError("Question video must be under 8 MB. For larger videos, paste a direct video URL.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm(f => ({ ...f, videoUrl: String(reader.result || "") }));
    };
    reader.onerror = () => setError("Unable to read the selected video.");
    reader.readAsDataURL(file);
  };

  const addOption = () => {
    if (form.options.length >= 6) return;
    setForm({ ...form, options: [...form.options, ""], optionScores: [...(form.optionScores || []), ""] });
  };

  const removeOption = (index) => {
    if (form.options.length <= 2) return;
    const opts = form.options.filter((_, i) => i !== index);
    setForm({
      ...form,
      options: opts,
      optionScores: (form.optionScores || []).filter((_, i) => i !== index),
      correctAnswers: form.correctAnswers
        .filter(i => i !== index)
        .map(i => i > index ? i - 1 : i),
      categoryCorrectAnswers: Object.fromEntries(
        Object.entries(form.categoryCorrectAnswers || {}).map(([cat, answers]) => [
          cat,
          uniqueSortedIndexes(answers)
            .filter(i => i !== index)
            .map(i => i > index ? i - 1 : i),
        ])
      ),
    });
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.questionText.trim()) return setError("Question text is required");
    const questionType = form.questionType === "theory" ? "theory" : "mcq";
    const trimmedOptions = questionType === "theory"
      ? []
      : form.options.map(o => o.trim()).filter(Boolean);
    if (questionType === "mcq" && trimmedOptions.length < 2) return setError("At least 2 options are required");
    const usesCategoryAnswerKeys = form.categories.length > 1;
    const formHasWeightedScores = hasWeightedOptionScores(form.optionScores);
    if (questionType === "mcq" && !usesCategoryAnswerKeys && form.correctAnswers.length === 0 && !formHasWeightedScores) {
      return setError("Select at least one correct answer");
    }
    if (questionType === "mcq" && usesCategoryAnswerKeys && !formHasWeightedScores) {
      const missingCats = form.categories.filter(cat => {
        const answers = form.categoryCorrectAnswers?.[cat] || [];
        return answers.every(i => !form.options[i]?.trim());
      });
      if (missingCats.length > 0) {
        return setError(`Select answer(s) for: ${missingCats.join(", ")}`);
      }
    }

    const remappedCorrect = [];
    const oldToNew = {};
    let currentNewIdx = 0;
    form.options.forEach((opt, oldIdx) => {
      if (opt.trim()) {
        oldToNew[oldIdx] = currentNewIdx;
        if (form.correctAnswers.includes(oldIdx)) remappedCorrect.push(currentNewIdx);
        currentNewIdx++;
      }
    });
    const remappedCategoryCorrect = form.categories.reduce((acc, cat) => {
      const rawAnswers = form.categoryCorrectAnswers?.[cat] || [];
      const remapped = uniqueSortedIndexes(rawAnswers)
        .map(i => oldToNew[i])
        .filter(Number.isInteger);
      acc[cat] = remapped.length > 0 ? remapped : remappedCorrect;
      return acc;
    }, {});
    const fallbackCorrect = remappedCorrect.length > 0
      ? remappedCorrect
      : uniqueSortedIndexes(Object.values(remappedCategoryCorrect).flat());
    const remappedOptionScores = form.options.reduce((acc, opt, oldIdx) => {
      if (!opt.trim()) return acc;
      const value = form.optionScores?.[oldIdx];
      const numeric = Number(value);
      acc.push(Number.isFinite(numeric) ? numeric : 0);
      return acc;
    }, []);
    const hasOptionScores = formHasWeightedScores;
    const weightedCorrect = hasOptionScores ? maxScoreIndexes(remappedOptionScores) : [];
    const finalCorrect = fallbackCorrect.length > 0 ? fallbackCorrect : weightedCorrect;

    const payload = {
      questionText:  form.questionText.trim(),
      imageUrl:      form.imageUrl.trim(),
      videoUrl:      form.videoUrl.trim(),
      questionType,
      options:       trimmedOptions,
      correctAnswer: questionType === "theory" ? [] : finalCorrect,
      optionScores:  questionType === "theory" || !hasOptionScores ? [] : remappedOptionScores,
      categoryCorrectAnswers: questionType === "theory" ? {} : remappedCategoryCorrect,
      explanation:   form.explanation.trim(),
      marks:         Number(form.marks) || 1,
      category:      form.categories,
      testSuite:     suiteId,
    };

    setSaving(true);
    try {
      const config = { headers: getAuthHeaders() };
      if (editingQ) {
        const res = await axios.put(`${API}/api/questions/${editingQ}`, payload, config);
        setQuestions(prev => sortQuestionsBySuiteOrder(prev.map(q => q._id === editingQ ? res.data : q)));
      } else {
        const res = await axios.post(`${API}/api/test-suites/${suiteId}/questions`, payload, config);
        setQuestions(prev => sortQuestionsBySuiteOrder([...prev, res.data]));
      }
      handleCancelForm();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (q) => {
    const opts = q.options.length < 4
      ? [...q.options, ...Array(4 - q.options.length).fill("")]
      : q.options;
    const cats = Array.isArray(q.category) ? q.category : (q.category ? [q.category] : []);
    const defaultCorrect = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
    const savedCategoryAnswers = getCategoryAnswerMap(q);
    const categoryCorrectAnswers = cats.reduce((acc, cat) => {
      acc[cat] = uniqueSortedIndexes(savedCategoryAnswers?.[cat] || defaultCorrect);
      return acc;
    }, {});
    setForm({
      questionText:   q.questionText,
      imageUrl:       q.imageUrl || "",
      videoUrl:       q.videoUrl || "",
      questionType:   q.questionType === "theory" ? "theory" : "mcq",
      options:        opts,
      correctAnswers: defaultCorrect,
      optionScores:   opts.map((_, index) => q.optionScores?.[index] ?? ""),
      categoryCorrectAnswers,
      explanation:    q.explanation || "",
      marks:          q.marks || 1,
      categories:     cats,
    });
    setEditingQ(q._id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await axios.delete(`${API}/api/questions/${qId}`, {
        headers: getAuthHeaders(),
      });
      setQuestions(prev => prev.filter(q => q._id !== qId));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete question.");
    }
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingQ(null);
    setForm(emptyForm);
    setError("");
  };

  const inputStyle = {
    width: "100%", border: "1px solid #ddd", borderRadius: "10px",
    padding: "10px 12px", fontSize: "14px", outline: "none",
    boxSizing: "border-box", fontFamily: "inherit", background: WHITE,
  };
  const labelStyle = {
    fontSize: "12px", color: "#666", display: "block", marginBottom: "5px",
    fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em",
  };

  const orderedQuestions = sortQuestionsBySuiteOrder(questions);
  const questionNumberById = new Map(orderedQuestions.map((q, index) => [String(q._id), index + 1]));
  const questionSearchTerm = questionSearch.trim().toLowerCase();
  const filteredQuestions = orderedQuestions.filter(q => {
        const cats = Array.isArray(q.category) ? q.category : (q.category ? [q.category] : []);
        const matchesCategory = categoryFilter === "all" || cats.includes(categoryFilter);
        if (!matchesCategory) return false;
        if (!questionSearchTerm) return true;
        const questionNumber = questionNumberById.get(String(q._id)) || "";
        const haystack = [
          `q${questionNumber}`,
          questionNumber,
          q.questionText,
          q.explanation,
          q.questionType,
          ...(q.options || []),
          ...cats,
        ].join(" ").toLowerCase();
        return haystack.includes(questionSearchTerm);
      });
  const grouped = filteredQuestions.reduce((acc, q) => {
    const cats = Array.isArray(q.category) && q.category.length > 0 ? q.category : ["Uncategorized"];
    const key  = cats[0];
    if (!acc[key]) acc[key] = [];
    acc[key].push(q);
    return acc;
  }, {});

  if (loading) return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>Loading…</div>;
  if (error && !suite) return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626", fontWeight: 700 }}>{error}</div>;
  if (!suite)  return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626" }}>Test suite not found.</div>;

  return (
    <div className="suite-detail-page" style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileChange} />

      {/* ── Top bar ── */}
      <div className="suite-detail-topbar" style={{ padding: "16px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: WHITE, border: "0.5px solid rgba(0,0,0,0.1)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="Logo" style={{ width: "48px", height: "48px", objectFit: "contain" }} onError={e => { e.target.style.display = "none"; }} />
          </div>
          <div className="suite-detail-heading-copy">
            <h1>{suite.name}</h1>
            {suite.description && <p>{suite.description}</p>}
          </div>
        </div>
        <span className={`suite-status-pill ${suite.status === "active" ? "active" : ""}`} style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "999px", fontWeight: "600", background: "#dcfce7", color: "#166534" }}>{suite.status}</span>
      </div>

      {/* ── Nav ── */}
      <div className="suite-detail-nav" style={{ padding: "12px 28px", display: "flex", gap: "24px", alignItems: "center", borderBottom: "0.5px solid rgba(0,0,0,0.09)", marginTop: "4px" }}>
        <span onClick={() => navigate("/dashboard")} style={{ fontSize: "14px", color: "#4A7A5C", fontWeight: "500", cursor: "pointer" }}>← Back to dashboard</span>
        <span style={{ fontSize: "13px", color: "#aaa" }}>{questions.length} question{questions.length !== 1 ? "s" : ""}</span>
        <span style={{ fontSize: "13px", color: "#aaa" }}>⏱ {suite.duration || 30} min</span>
        {suite.questionSelectionMode === "selected" && (
          <span style={{ fontSize: "13px", color: "#f59e0b" }}>📌 {(suite.selectedQuestionIds || []).length} selected</span>
        )}
        {(suite.questionSelectionMode === "random" || (!suite.questionSelectionMode && suite.questionsToServe)) && suite.questionsToServe && (
          <span style={{ fontSize: "13px", color: "#f59e0b" }}>🎲 {suite.questionsToServe} random</span>
        )}
        {suite.scoringMode === "sixteen_pf" && (
          <span style={{ fontSize: "13px", color: "#7c3aed" }}>🧠 16PF scoring</span>
        )}
        {suite.startDate && (
          <span style={{ fontSize: "13px", color: "#6366f1" }}>
            📅 {new Date(suite.startDate).toLocaleDateString()} – {suite.endDate ? new Date(suite.endDate).toLocaleDateString() : "∞"}
          </span>
        )}
        <span onClick={() => { localStorage.removeItem("token"); navigate("/"); }} style={{ fontSize: "14px", color: "#C0392B", fontWeight: "500", cursor: "pointer", marginLeft: "auto" }}>Logout</span>
        <LanguageSwitcher className="suite-language-switcher" />
      </div>

      <div className="suite-detail-content" style={{ padding: "24px 28px" }}>

        {/* ── Action buttons ── */}
        <div className="suite-detail-actions" style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
          {canManageQuestions && (
            <>
              <button onClick={() => { setEditingQ(null); setForm(emptyForm); setError(""); setShowForm(s => !s); }}
                style={{ padding: "10px 20px", background: showForm && !editingQ ? "#555" : GREEN, color: WHITE, border: "none", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                {showForm && !editingQ ? "Cancel" : "+ Add question"}
              </button>
              <button onClick={handleImportClick} disabled={importing}
                style={{ padding: "10px 20px", background: WHITE, color: GREEN, border: `1.5px solid ${GREEN}`, borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: importing ? 0.6 : 1 }}>
                {importing ? "Importing…" : "⬆️ Import Excel Questions"}
              </button>
              <button onClick={handleDownloadImportTemplate}
                style={{ padding: "10px 20px", background: WHITE, color: GREEN_DARK, border: "1px solid #d8e9df", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                ⬇️ Excel Format
              </button>
              <button onClick={() => setShowCatManager(s => !s)}
                style={{ padding: "10px 20px", background: WHITE, color: GREEN, border: `1.5px solid ${GREEN}`, borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                🏷️ Manage categories {categories.length > 0 ? `(${categories.length})` : ""}
              </button>
            </>
          )}
          {canManageSuiteSettings && (
            <>
              <button onClick={() => setShowDuration(s => !s)}
                style={{ padding: "10px 20px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                ⏱ Suite settings ({suite.duration || 30} min{suite.submitDelayMinutes ? `, submit after ${suite.submitDelayMinutes} min` : ""}, result {suite.showResultsAfterSubmission === false ? "hidden" : "shown"})
              </button>
              <button onClick={() => { setShowDuration(true); }}
                className={`suite-result-visibility-action ${suite.showResultsAfterSubmission === false ? "hidden" : "visible"}`}
                style={{ padding: "10px 20px", background: WHITE, color: suite.showResultsAfterSubmission === false ? "#b91c1c" : "#166534", border: "1px solid #bbf7d0", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                Show result option ({suite.showResultsAfterSubmission === false ? "off" : "on"})
              </button>
              <button onClick={() => setShowPassing(s => !s)}
                style={{ padding: "10px 20px", background: WHITE, color: "#166534", border: "1px solid #86efac", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                ✅ Passing criteria ({suite.passingPercentage ?? 50}%)
              </button>
              <button onClick={() => setShowQtsServe(s => !s)}
                style={{ padding: "10px 20px", background: WHITE, color: "#f59e0b", border: "1px solid #fcd34d", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                🎯 Question set {suite.questionSelectionMode === "selected"
                  ? `(${(suite.selectedQuestionIds || []).length} selected)`
                  : suite.questionsToServe ? `(${suite.questionsToServe} random)` : "(all)"}
              </button>
              <button onClick={() => setShowScoring(s => !s)}
                style={{ padding: "10px 20px", background: WHITE, color: "#6d28d9", border: "1px solid #ddd6fe", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                🧠 Scoring mode ({suite.scoringMode === "sixteen_pf" ? "16PF" : "standard"})
              </button>
              {/* Feature 9 */}
              <button onClick={() => setShowDateWindow(s => !s)}
                style={{ padding: "10px 20px", background: WHITE, color: "#6366f1", border: "1px solid #c7d2fe", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                📅 Availability window
              </button>
            </>
          )}
          <button onClick={() => navigate(`/admin/results?suite=${suiteId}`)}
            style={{ padding: "10px 20px", background: WHITE, color: "#333", border: "1px solid #ddd", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
            View results
          </button>
        </div>

        <div className="suite-question-search-panel" style={{ background: WHITE, border: "1px solid #d8e9df", borderRadius: "16px", padding: "14px 16px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={questionSearch}
            onChange={e => setQuestionSearch(e.target.value)}
            placeholder="Search questions by number, text, category, option..."
            style={{ ...inputStyle, flex: "1 1 320px", minWidth: 0 }}
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ ...inputStyle, flex: "0 0 230px" }}
            aria-label="Filter questions by category"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <span style={{ color: "#6B6B5E", fontSize: "13px", fontWeight: "700" }}>
            {filteredQuestions.length} of {questions.length} question{questions.length !== 1 ? "s" : ""}
          </span>
          {questionSearch && (
            <button type="button" onClick={() => setQuestionSearch("")} style={{ padding: "9px 14px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>

        {/* ── Duration Panel ── */}
        {showDuration && (
          <div style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: GREEN_DARK, marginTop: 0, marginBottom: "6px" }}>⏱ Test Suite Settings</h2>
            <p style={{ fontSize: "13px", color: "#888", marginBottom: "14px" }}>
              Set duration, submit timing, and whether candidates see results immediately after submitting this test suite.
            </p>
            <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label style={labelStyle}>Test duration</label>
                <input type="number" min={1} max={300} value={durationVal} onChange={e => setDurationVal(e.target.value)} style={{ ...inputStyle, width: "140px" }} />
              </div>
              <div>
                <label style={labelStyle}>Enable submit after</label>
                <input type="number" min={0} max={durationVal || 300} value={submitDelayVal} onChange={e => setSubmitDelayVal(e.target.value)} style={{ ...inputStyle, width: "160px" }} />
              </div>
              <span style={{ fontSize: "14px", color: "#666", paddingBottom: "11px" }}>minutes</span>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "42px", padding: "10px 14px", border: "1px solid #d8e9df", borderRadius: "12px", background: "#f8fcf9", color: GREEN_DARK, fontSize: "13px", fontWeight: "800", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showResultsAfterSubmission}
                  onChange={e => setShowResultsAfterSubmission(e.target.checked)}
                  style={{ width: "18px", height: "18px", accentColor: GREEN }}
                />
                Show result immediately after submission
              </label>
              <button onClick={handleSaveDuration} disabled={savingDur} style={{ padding: "10px 20px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: savingDur ? 0.6 : 1 }}>
                {savingDur ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowDuration(false)} style={{ padding: "10px 16px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            </div>
            <p style={{ fontSize: "12px", color: "#6b7280", margin: "10px 0 0" }}>
              Example: duration 30 and submit-after 20 means candidates can answer immediately, but the manual submit button unlocks after 20 minutes. Auto-submit still happens at 30 minutes.
            </p>
          </div>
        )}

        {showPassing && (
          <div style={{ background: WHITE, border: "1px solid #86efac", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: "#166534", marginTop: 0, marginBottom: "6px" }}>✅ Test-wise Passing Criteria</h2>
            <p style={{ fontSize: "13px", color: "#888", marginBottom: "14px" }}>
              This pass percentage applies only to this test.
            </p>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                type="number"
                min={0}
                max={100}
                value={passingVal}
                onChange={e => setPassingVal(e.target.value)}
                style={{ ...inputStyle, width: "120px" }}
              />
              <span style={{ fontSize: "14px", color: "#666" }}>% required to pass</span>
              <button onClick={handleSavePassing} disabled={savingPassing} style={{ padding: "10px 20px", background: "#166534", color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: savingPassing ? 0.6 : 1 }}>
                {savingPassing ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowPassing(false)} style={{ padding: "10px 16px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {showScoring && (
          <div style={{ background: WHITE, border: "1px solid #ddd6fe", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: "#5b21b6", marginTop: 0, marginBottom: "14px" }}>🧠 Suite Scoring Mode</h2>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <select value={scoringMode} onChange={e => setScoringMode(e.target.value)} style={{ ...inputStyle, maxWidth: "320px" }}>
                <option value="standard">Standard MCQ percentage</option>
                <option value="sixteen_pf">16PF weighted factor scoring</option>
              </select>
              <button onClick={handleSaveScoring} disabled={savingScoring} style={{ padding: "10px 20px", background: "#6d28d9", color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: savingScoring ? 0.6 : 1 }}>
                {savingScoring ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowScoring(false)} style={{ padding: "10px 16px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            </div>
            <p style={{ fontSize: "12px", color: "#6b7280", margin: "10px 0 0" }}>
              16PF mode uses option score columns from Excel, then stores factor raw score, percentage, 1-10 scale score, and trait label.
            </p>
          </div>
        )}

        {/* ── Feature 5: Candidate Question Set Panel ── */}
        {showQtsServe && (
          <div style={{ background: WHITE, border: "1px solid #fcd34d", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: "#92400e", marginTop: 0, marginBottom: "6px" }}>🎯 Candidate Question Set</h2>
            <p style={{ fontSize: "13px", color: "#888", marginBottom: "14px" }}>
              You have {questions.length} questions. Choose whether candidates get all questions, a random count, or only selected questions.
            </p>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
              {[
                { value: "all", label: "All questions" },
                { value: "random", label: "Random count" },
                { value: "selected", label: "Selected questions" },
              ].map(mode => {
                const active = questionMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setQuestionMode(mode.value)}
                    style={{
                      padding: "9px 14px",
                      borderRadius: "999px",
                      border: active ? "1.5px solid #f59e0b" : "1px solid #fcd34d",
                      background: active ? "#fffbeb" : WHITE,
                      color: active ? "#92400e" : "#666",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    {active ? "✓ " : ""}{mode.label}
                  </button>
                );
              })}
            </div>

            {questionMode === "random" && (
              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
                <input
                  type="number" min={1} max={questions.length}
                  placeholder={`Max ${questions.length}`}
                  value={qtsServeVal}
                  onChange={e => setQtsServeVal(e.target.value)}
                  style={{ ...inputStyle, width: "140px" }}
                />
                <span style={{ fontSize: "14px", color: "#666" }}>random questions per candidate</span>
              </div>
            )}

            {questionMode === "selected" && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "13px", color: "#92400e", fontWeight: "700" }}>{selectedQuestionIds.length} question(s) selected</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button type="button" onClick={() => setSelectedQuestionIds(orderedQuestions.map(q => q._id))} style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #fcd34d", background: WHITE, color: "#92400e", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Select all</button>
                    <button type="button" onClick={() => setSelectedQuestionIds([])} style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #ddd", background: WHITE, color: "#555", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Clear</button>
                  </div>
                </div>
                <div style={{ maxHeight: "300px", overflow: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "4px" }}>
                  {orderedQuestions.map((q) => {
                    const checked = selectedQuestionIds.includes(q._id);
                    const questionNumber = questionNumberById.get(String(q._id)) || 1;
                    return (
                      <label key={q._id} style={{
                        display: "grid",
                        gridTemplateColumns: "18px 1fr",
                        gap: "10px",
                        alignItems: "start",
                        padding: "10px 12px",
                        border: checked ? "1.5px solid #f59e0b" : "1px solid #eee",
                        borderRadius: "10px",
                        background: checked ? "#fffbeb" : "#fafafa",
                        cursor: "pointer",
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleSelectedQuestion(q._id)} style={{ accentColor: "#f59e0b", marginTop: "2px" }} />
                        <span style={{ color: "#333", fontSize: "13px", lineHeight: 1.45 }}>
                          <strong>Q{questionNumber}.</strong> {q.questionText}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {questionMode === "all" && (
              <p style={{ fontSize: "13px", color: "#666", margin: "0 0 14px" }}>
                Candidates will receive the complete question bank for this suite.
              </p>
            )}

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button onClick={handleSaveQtsServe} disabled={savingQts} style={{ padding: "10px 20px", background: "#f59e0b", color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: savingQts ? 0.6 : 1 }}>
                {savingQts ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowQtsServe(false)} style={{ padding: "10px 16px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Feature 9: Date Window Panel ── */}
        {showDateWindow && (
          <div style={{ background: WHITE, border: "1px solid #c7d2fe", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: "#3730a3", marginTop: 0, marginBottom: "6px" }}>📅 Test Availability Window</h2>
            <p style={{ fontSize: "13px", color: "#888", marginBottom: "14px" }}>
              Candidates can only start this test within this window. Leave blank for no restriction.
            </p>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ ...labelStyle, color: "#6366f1" }}>Start Date & Time</label>
                <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, width: "220px" }} />
              </div>
              <div>
                <label style={{ ...labelStyle, color: "#6366f1" }}>End Date & Time</label>
                <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, width: "220px" }} />
              </div>
              <button onClick={handleSaveDates} disabled={savingDates} style={{ padding: "10px 20px", background: "#6366f1", color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: savingDates ? 0.6 : 1 }}>
                {savingDates ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowDateWindow(false)} style={{ padding: "10px 16px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            </div>
            {startDate && endDate && (
              <p style={{ fontSize: "12px", color: "#6366f1", marginTop: "10px", marginBottom: 0 }}>
                ✓ Window: {new Date(startDate).toLocaleString()} → {new Date(endDate).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* ── Category Manager Panel ── */}
        {showCatManager && (
          <div style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: GREEN_DARK, marginTop: 0, marginBottom: "14px" }}>🏷️ Your Categories</h2>
            <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Type a new category name…" value={newCatInput}
                onChange={e => { setNewCatInput(e.target.value); setCatError(""); }}
                onKeyDown={e => e.key === "Enter" && handleAddCategory()} />
              <button onClick={handleAddCategory} style={{ padding: "10px 20px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>+ Add</button>
            </div>
            {catError && <p style={{ color: "#dc2626", fontSize: "12px", margin: "0 0 10px" }}>{catError}</p>}
            {categories.length === 0 ? (
              <p style={{ color: "#aaa", fontSize: "13px", margin: "12px 0 0" }}>No categories yet.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
                {categories.map(cat => (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#E8F2EC", borderRadius: "999px", padding: "5px 12px" }}>
                    <span style={{ fontSize: "13px", color: GREEN_DARK, fontWeight: "600" }}>{cat}</span>
                    <button onClick={() => handleDeleteCategory(cat)} style={{ background: "none", border: "none", color: "#999", fontSize: "16px", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Add / Edit Question Form ── */}
        {showForm && canManageQuestions && (
          <div style={{ background: WHITE, border: `2px solid ${GREEN}`, borderRadius: "16px", padding: "24px", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "700", color: GREEN_DARK, marginBottom: "18px", marginTop: 0 }}>
              {editingQ ? "✏️ Edit question" : "New question"}
            </h2>
            {error && <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Question *</label>
                <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Enter the question text here…"
                  value={form.questionText} onChange={e => setForm({ ...form, questionText: e.target.value })} />
              </div>
              <div className="suite-media-input-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "end" }}>
                <div>
                  <label style={labelStyle}>Question picture (optional)</label>
                  <input
                    style={inputStyle}
                    placeholder="Paste image URL, or upload below"
                    value={form.imageUrl}
                    onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, imageUrl: "" })}
                  disabled={!form.imageUrl}
                  style={{ padding: "10px 14px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: form.imageUrl ? "pointer" : "not-allowed", opacity: form.imageUrl ? 1 : 0.55 }}
                >
                  Remove
                </button>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleQuestionImageFile(e.target.files?.[0])}
                  style={{ ...inputStyle, gridColumn: "1 / -1", padding: "8px 12px" }}
                />
                {isQuestionImage(form.imageUrl) && (
                  <div style={{ gridColumn: "1 / -1", border: "1px solid #d8e9df", borderRadius: "12px", padding: "10px", background: "#f8faf9" }}>
                    <img src={form.imageUrl} alt="Question preview" style={{ maxWidth: "100%", maxHeight: "260px", objectFit: "contain", display: "block", margin: "0 auto", borderRadius: "10px" }} />
                  </div>
                )}
              </div>
              <div className="suite-media-input-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "end" }}>
                <div>
                  <label style={labelStyle}>Question video (optional)</label>
                  <input
                    style={inputStyle}
                    placeholder="Paste direct video URL, or upload below"
                    value={form.videoUrl}
                    onChange={e => setForm({ ...form, videoUrl: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, videoUrl: "" })}
                  disabled={!form.videoUrl}
                  style={{ padding: "10px 14px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: form.videoUrl ? "pointer" : "not-allowed", opacity: form.videoUrl ? 1 : 0.55 }}
                >
                  Remove
                </button>
                <input
                  type="file"
                  accept="video/*"
                  onChange={e => handleQuestionVideoFile(e.target.files?.[0])}
                  style={{ ...inputStyle, gridColumn: "1 / -1", padding: "8px 12px" }}
                />
                {isQuestionVideo(form.videoUrl) && (
                  <div style={{ gridColumn: "1 / -1", border: "1px solid #d8e9df", borderRadius: "12px", padding: "10px", background: "#f8faf9" }}>
                    <video src={form.videoUrl} controls playsInline style={{ width: "100%", maxHeight: "320px", display: "block", borderRadius: "10px", background: "#111" }} />
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Question Type *</label>
                <div style={{ display: "inline-flex", gap: "8px", background: "#f4f7f5", borderRadius: "12px", padding: "4px", border: "1px solid #d8e9df" }}>
                  {[
                    { value: "mcq", label: "MCQ" },
                    { value: "theory", label: "Theory" },
                  ].map(type => {
                    const selected = form.questionType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          questionType: type.value,
                          correctAnswers: type.value === "theory" ? [] : f.correctAnswers,
                          categoryCorrectAnswers: type.value === "theory" ? {} : f.categoryCorrectAnswers,
                        }))}
                        style={{
                          padding: "8px 18px",
                          borderRadius: "10px",
                          border: "none",
                          background: selected ? GREEN : "transparent",
                          color: selected ? WHITE : GREEN_DARK,
                          fontSize: "13px",
                          fontWeight: "700",
                          cursor: "pointer",
                        }}
                      >
                        {selected ? "✓ " : ""}{type.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Categories (optional)</label>
                {categories.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "#aaa", margin: 0 }}>
                    No categories yet.{" "}
                    <span onClick={() => setShowCatManager(true)} style={{ color: GREEN, cursor: "pointer", fontWeight: "600", textDecoration: "underline" }}>Add categories first →</span>
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {categories.map(cat => {
                      const selected = form.categories.includes(cat);
                      return (
                        <button key={cat} onClick={() => toggleCategory(cat)}
                          style={{ padding: "6px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: "600", cursor: "pointer", border: "1.5px solid", background: selected ? GREEN : WHITE, color: selected ? WHITE : GREEN, borderColor: selected ? GREEN : "#c8dfd0" }}>
                          {selected ? "✓ " : ""}{cat}
                        </button>
                      );
                    })}
                  </div>
                )}
                {form.categories.length > 0 && (
                  <p style={{ fontSize: "12px", color: "#888", margin: "6px 0 0" }}>Selected: {form.categories.join(", ")}</p>
                )}
              </div>
              {form.questionType === "mcq" ? (
              <div>
                <label style={labelStyle}>Options * — default correct answer</label>
                <div style={{ fontSize: "12px", color: "#888", marginBottom: "10px" }}>Use the category answer key below when different categories have different answers.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {form.options.map((opt, i) => {
                    const isCorrect = form.correctAnswers.includes(i);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <input type="checkbox" checked={isCorrect} onChange={() => toggleCorrectAnswer(i)} disabled={!opt.trim()}
                          style={{ accentColor: GREEN, width: "16px", height: "16px", flexShrink: 0, cursor: opt.trim() ? "pointer" : "not-allowed" }} />
                        <input style={{ ...inputStyle, flex: 1, width: "auto", border: isCorrect ? `2px solid ${GREEN}` : "1px solid #ddd", background: isCorrect ? "#f0faf5" : WHITE }}
                          placeholder={`Option ${i + 1}${i >= 2 ? " (optional)" : ""}`} value={opt} onChange={e => handleOptionChange(i, e.target.value)} />
                        <input
                          type="number"
                          step="0.5"
                          value={form.optionScores?.[i] ?? ""}
                          onChange={e => handleOptionScoreChange(i, e.target.value)}
                          placeholder="Score"
                          disabled={!opt.trim()}
                          title="Optional weighted score for this option"
                          style={{ ...inputStyle, width: "86px", flex: "0 0 86px", background: opt.trim() ? WHITE : "#f3f4f6" }}
                        />
                        {isCorrect && <span style={{ fontSize: "12px", color: GREEN, fontWeight: "600", whiteSpace: "nowrap", minWidth: "60px" }}>✓ Correct</span>}
                        {form.options.length > 2 && (
                          <button onClick={() => removeOption(i)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: "20px", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }}>×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {form.options.length < 6 && (
                  <button onClick={addOption} style={{ marginTop: "10px", padding: "7px 16px", background: "none", border: `1px dashed ${GREEN}`, borderRadius: "10px", color: GREEN, fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                    + Add option
                  </button>
                )}
                {form.correctAnswers.length > 1 && (
                  <div style={{ marginTop: "10px", padding: "8px 14px", background: "#f0faf5", border: `1px solid ${GREEN}`, borderRadius: "10px", fontSize: "12px", color: GREEN_DARK, fontWeight: "600" }}>
                    ✓ Multiple correct answers: {form.correctAnswers.length} selected
                  </div>
                )}
                {form.categories.length > 0 && (
                  <div style={{ marginTop: "14px", padding: "14px", background: "#f8faf9", border: "1px solid #d8e9df", borderRadius: "12px" }}>
                    <label style={{ ...labelStyle, color: GREEN_DARK, marginBottom: "10px" }}>Category answer key</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {form.categories.map(cat => {
                        const selectedAnswers = form.categoryCorrectAnswers?.[cat] || [];
                        return (
                          <div key={cat} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "10px", alignItems: "start" }}>
                            <div style={{ fontSize: "13px", color: GREEN_DARK, fontWeight: "700", paddingTop: "6px" }}>{cat}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                              {form.options.map((opt, i) => {
                                const hasText = opt.trim();
                                const selected = selectedAnswers.includes(i);
                                return (
                                  <label key={`${cat}-${i}`} style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    minHeight: "32px",
                                    padding: "6px 10px",
                                    borderRadius: "8px",
                                    border: selected ? `1.5px solid ${GREEN}` : "1px solid #d7ded9",
                                    background: selected ? "#e8f4ed" : WHITE,
                                    color: hasText ? (selected ? GREEN_DARK : "#555") : "#aaa",
                                    fontSize: "12px",
                                    fontWeight: selected ? "700" : "500",
                                    cursor: hasText ? "pointer" : "not-allowed",
                                  }}>
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      disabled={!hasText}
                                      onChange={() => toggleCategoryCorrectAnswer(cat, i)}
                                      style={{ accentColor: GREEN }}
                                    />
                                    {String.fromCharCode(65 + i)}. {hasText ? opt : `Option ${i + 1}`}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              ) : (
                <div style={{ padding: "14px", background: "#f8faf9", border: "1px solid #d8e9df", borderRadius: "12px", color: GREEN_DARK, fontSize: "13px", fontWeight: "600" }}>
                  Theory question: candidates will write a text answer. This answer is saved for admin review and is not auto-scored.
                </div>
              )}
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Explanation (optional)</label>
                  <input style={inputStyle} placeholder="Why is this the correct answer?" value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} />
                </div>
                <div style={{ width: "90px" }}>
                  <label style={labelStyle}>Marks</label>
                  <input type="number" min={1} style={inputStyle} value={form.marks} onChange={e => setForm({ ...form, marks: Number(e.target.value) })} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={handleSubmit} disabled={saving} style={{ padding: "10px 24px", background: GREEN, color: WHITE, border: "none", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : editingQ ? "Save changes" : "Save question"}
                </button>
                <button onClick={handleCancelForm} style={{ padding: "10px 20px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Questions list ── */}
        {questions.length === 0 ? (
          <div style={{ background: WHITE, borderRadius: "16px", border: "2px dashed #e5e7eb", padding: "48px 28px", textAlign: "center" }}>
            <p style={{ color: "#aaa", fontSize: "14px", margin: 0 }}>
              {canManageQuestions ? 'No questions yet. Click "+ Add question" to start.' : "No questions are available in this suite."}
            </p>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div style={{ background: WHITE, borderRadius: "16px", border: "2px dashed #e5e7eb", padding: "42px 28px", textAlign: "center" }}>
            <p style={{ color: "#8A8A7E", fontSize: "14px", margin: 0 }}>No questions match "{questionSearch}".</p>
          </div>
        ) : (
          <div className="suite-question-list" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {Object.entries(grouped).map(([cat, qs]) => (
              <div key={cat}>
                <div className="suite-question-group-heading" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#8A8A7E", letterSpacing: "0.08em", textTransform: "uppercase" }}>{cat}</span>
                  <span style={{ fontSize: "11px", background: "#E8F2EC", color: GREEN, padding: "2px 8px", borderRadius: "999px", fontWeight: "600" }}>{qs.length}</span>
                  <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {qs.map((q) => {
                    const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
                    const optionScores = normalizedOptionScores(q.optionScores, q.options?.length || 0);
                    const hasScores = hasWeightedOptionScores(q.optionScores);
                    const maxOptionScore = hasScores ? Math.max(...optionScores) : null;
                    const catArr     = Array.isArray(q.category) ? q.category : (q.category ? [q.category] : []);
                    const categoryAnswerMap = getCategoryAnswerMap(q);
                    const theory = isTheoryQuestion(q);
                    const questionNumber = questionNumberById.get(String(q._id)) || 1;
                    return (
                      <div key={q._id}
                        className="suite-question-card"
                        style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "14px", padding: "16px 18px", transition: "border-color 0.2s" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = GREEN}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "#e5e7eb"}
                      >
                        <div className="suite-question-card-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                          <div className="suite-question-main" style={{ flex: 1 }}>
                            {catArr.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
                                {catArr.map(c => (
                                  <span key={c} style={{ fontSize: "11px", background: "#E8F2EC", color: GREEN, padding: "2px 8px", borderRadius: "999px", fontWeight: "600" }}>{c}</span>
                                ))}
                              </div>
                            )}
                            <p className="suite-question-text" style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a1a", margin: "0 0 10px" }}>
                              <span style={{ color: "#aaa", marginRight: "6px" }}>Q{questionNumber}.</span>{q.questionText}
                            </p>
                            {isQuestionImage(q.imageUrl) && (
                              <img src={q.imageUrl} alt={`Question ${questionNumber}`} style={{ width: "100%", maxHeight: "320px", objectFit: "contain", background: "#f8faf9", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "8px", margin: "0 0 12px" }} />
                            )}
                            {isQuestionVideo(q.videoUrl) && (
                              <video src={q.videoUrl} controls playsInline style={{ width: "100%", maxHeight: "360px", background: "#111", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "8px", margin: "0 0 12px" }} />
                            )}
                            {theory ? (
                              <div style={{ background: "#f8faf9", border: "1px solid #d8e9df", color: GREEN_DARK, borderRadius: "8px", padding: "8px 10px", fontSize: "13px", fontWeight: "600" }}>
                                Theory question - written answer
                              </div>
                            ) : (
                            <div className="suite-option-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                              {q.options.map((opt, i) => {
                                const isCorrect = hasScores ? optionScores[i] === maxOptionScore && maxOptionScore > 0 : correctArr.includes(i);
                                const optionScore = optionScores[i] ?? 0;
                                return (
                                  <p key={i} className="suite-option-pill" style={{ fontSize: "13px", margin: 0, padding: "6px 10px", borderRadius: "8px", background: isCorrect ? "#dcfce7" : optionScore > 0 ? "#fff7ed" : "#f9fafb", color: isCorrect ? "#166534" : optionScore > 0 ? "#9a3412" : "#555", fontWeight: isCorrect || optionScore > 0 ? "600" : "400" }}>
                                    {String.fromCharCode(65 + i)}. {opt}{isCorrect && !hasScores ? " ✓" : ""}{hasScores ? ` · ${optionScore} pts` : ""}
                                  </p>
                                );
                              })}
                            </div>
                            )}
                            {q.explanation && <p style={{ fontSize: "12px", color: "#888", marginTop: "8px", marginBottom: 0, fontStyle: "italic" }}>💡 {q.explanation}</p>}
                            <div className="suite-question-badges" style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "11px", background: "#f3f4f6", color: "#555", padding: "2px 8px", borderRadius: "999px" }}>{hasScores ? "Weighted option scores" : `${q.marks ?? 1} mark${(q.marks ?? 1) !== 1 ? "s" : ""}`}</span>
                              <span style={{ fontSize: "11px", background: theory ? "#dbeafe" : "#dcfce7", color: theory ? "#1d4ed8" : "#166534", padding: "2px 8px", borderRadius: "999px", fontWeight: "600" }}>{theory ? "Theory" : "MCQ"}</span>
                              {!theory && !hasScores && correctArr.length > 1 && <span style={{ fontSize: "11px", background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "999px" }}>Multiple correct</span>}
                            </div>
                            {!theory && hasScores && catArr.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
                                {catArr.map(c => (
                                  <span key={`${q._id}-${c}-scores`} style={{ fontSize: "11px", background: "#eef7f1", color: GREEN_DARK, border: "1px solid #cfe3d5", padding: "3px 8px", borderRadius: "8px", fontWeight: "600" }}>
                                    {c}: {q.options.map((_, i) => `${String.fromCharCode(65 + i)}=${optionScores[i] ?? 0}`).join(", ")}
                                  </span>
                                ))}
                              </div>
                            )}
                            {!theory && !hasScores && catArr.length > 0 && Object.keys(categoryAnswerMap).length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
                                {catArr.map(c => {
                                  const answersForCat = uniqueSortedIndexes(categoryAnswerMap[c] || correctArr);
                                  const labels = answersForCat.map(i => q.options[i]).filter(Boolean).join(", ");
                                  return (
                                    <span key={`${q._id}-${c}`} style={{ fontSize: "11px", background: "#eef7f1", color: GREEN_DARK, border: "1px solid #cfe3d5", padding: "3px 8px", borderRadius: "8px", fontWeight: "600" }}>
                                      {c}: {labels || "No answer"}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {canManageQuestions && (
                            <div className="suite-question-actions" style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                              <button onClick={() => handleEdit(q)} style={{ padding: "6px 12px", fontSize: "12px", fontWeight: "600", background: WHITE, color: GREEN, border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Edit</button>
                              <button onClick={() => handleDeleteQuestion(q._id)} style={{ padding: "6px 12px", fontSize: "12px", fontWeight: "600", background: WHITE, color: "#dc2626", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
