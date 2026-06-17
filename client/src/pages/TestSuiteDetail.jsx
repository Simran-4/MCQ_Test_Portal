// src/pages/TestSuiteDetail.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { getAuthHeaders } from "../utils/auth";

const API        = import.meta.env.VITE_API_URL || "http://localhost:5000";
const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

const emptyForm = {
  questionText:   "",
  questionType:   "mcq",
  options:        ["", "", "", ""],
  correctAnswers: [],
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

  if (!questionText) return { error: `Row ${rowNum}: missing questionText` };
  if (questionType === "mcq" && options.length < 2) return { error: `Row ${rowNum}: need at least 2 options` };
  if (questionType === "mcq" && correctAnswer.length === 0) {
    return { error: `Row ${rowNum}: invalid correctAnswers. Use 0-based index, A/B/C/D, or exact option text.` };
  }

  return {
    questionText,
    questionType,
    options: questionType === "theory" ? [] : options,
    correctAnswer: questionType === "theory" ? [] : correctAnswer,
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
  const [suite, setSuite]         = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [editingQ, setEditingQ]   = useState(null);

  const [showDuration, setShowDuration] = useState(false);
  const [durationVal, setDurationVal]   = useState(30);
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

  useEffect(() => { fetchData(); }, [suiteId]);

  const fetchData = async () => {
    try {
      const config = { headers: getAuthHeaders() };
      const [suiteRes, qRes] = await Promise.all([
        axios.get(`${API}/api/test-suites/${suiteId}`, config),
        axios.get(`${API}/api/test-suites/${suiteId}/questions`, config),
      ]);
      setSuite(suiteRes.data);
      setDurationVal(suiteRes.data.duration || 30);
      setQuestionMode(suiteRes.data.questionSelectionMode || (suiteRes.data.selectedQuestionIds?.length ? "selected" : suiteRes.data.questionsToServe ? "random" : "all"));
      setSelectedQuestionIds((suiteRes.data.selectedQuestionIds || []).map(id => String(id?._id || id)));
      setQtsServeVal(suiteRes.data.questionsToServe || "");
      setPassingVal(suiteRes.data.passingPercentage ?? 50);
      // Format dates for datetime-local input
      setStartDate(suiteRes.data.startDate
        ? new Date(suiteRes.data.startDate).toISOString().slice(0, 16) : "");
      setEndDate(suiteRes.data.endDate
        ? new Date(suiteRes.data.endDate).toISOString().slice(0, 16) : "");
      setQuestions(qRes.data);
      const existingCats = [...new Set(qRes.data.flatMap(q =>
        Array.isArray(q.category) ? q.category : (q.category ? [q.category] : [])
      ))];
      setCategories(prev => [...new Set([...prev, ...existingCats])]);
    } catch (err) {
      console.error("Failed to fetch suite data:", err);
    } finally {
      setLoading(false);
    }
  };

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
      "option1",
      "option2",
      "option3",
      "option4",
      "correctAnswers",
      "explanation",
      "marks",
      "category",
      "language",
      "questionType",
    ];
    const example = [
      "What is 2+2?",
      "3",
      "4",
      "5",
      "6",
      "1",
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
      let fallbackResult = null;
      try {
        await axios.post(`${API}/api/test-suites/${suiteId}/import-excel`, formData, {
          headers: getAuthHeaders({ "Content-Type": "multipart/form-data" }),
        });
      } catch (err) {
        if (err.response?.status !== 404) throw err;
        fallbackResult = await importQuestionsFromExcelInBrowser(file);
      }
      await fetchData();
      if (fallbackResult) {
        const details = fallbackResult.errors.length
          ? `\n\nSkipped ${fallbackResult.skipped} row(s):\n${fallbackResult.errors.slice(0, 5).join("\n")}`
          : "";
        alert(`Questions imported successfully: ${fallbackResult.imported}${details}`);
      } else {
        alert("Questions imported successfully!");
      }
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Import failed");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleSaveDuration = async () => {
    if (!durationVal || durationVal < 1) return alert("Please enter a valid duration");
    setSavingDur(true);
    try {
      await axios.put(`${API}/api/test-suites/${suiteId}`,
        { duration: Number(durationVal) },
        { headers: getAuthHeaders() }
      );
      setSuite(prev => ({ ...prev, duration: Number(durationVal) }));
      setShowDuration(false);
      alert("Duration saved!");
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

  const addOption = () => {
    if (form.options.length >= 6) return;
    setForm({ ...form, options: [...form.options, ""] });
  };

  const removeOption = (index) => {
    if (form.options.length <= 2) return;
    const opts = form.options.filter((_, i) => i !== index);
    setForm({
      ...form,
      options: opts,
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
    if (questionType === "mcq" && !usesCategoryAnswerKeys && form.correctAnswers.length === 0) {
      return setError("Select at least one correct answer");
    }
    if (questionType === "mcq" && usesCategoryAnswerKeys) {
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

    const payload = {
      questionText:  form.questionText.trim(),
      questionType,
      options:       trimmedOptions,
      correctAnswer: questionType === "theory" ? [] : fallbackCorrect,
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
        setQuestions(prev => prev.map(q => q._id === editingQ ? res.data : q));
      } else {
        const res = await axios.post(`${API}/api/test-suites/${suiteId}/questions`, payload, config);
        setQuestions(prev => [...prev, res.data]);
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
      questionType:   q.questionType === "theory" ? "theory" : "mcq",
      options:        opts,
      correctAnswers: defaultCorrect,
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

  const grouped = questions.reduce((acc, q) => {
    const cats = Array.isArray(q.category) && q.category.length > 0 ? q.category : ["Uncategorized"];
    const key  = cats[0];
    if (!acc[key]) acc[key] = [];
    acc[key].push(q);
    return acc;
  }, {});

  if (loading) return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>Loading…</div>;
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
          <div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: GREEN_DARK }}>{suite.name}</div>
            {suite.description && <div style={{ fontSize: "13px", color: "#6B6B5E", marginTop: "2px" }}>{suite.description}</div>}
          </div>
        </div>
        <span style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "999px", fontWeight: "600", background: "#dcfce7", color: "#166534" }}>{suite.status}</span>
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
        {suite.startDate && (
          <span style={{ fontSize: "13px", color: "#6366f1" }}>
            📅 {new Date(suite.startDate).toLocaleDateString()} – {suite.endDate ? new Date(suite.endDate).toLocaleDateString() : "∞"}
          </span>
        )}
        <span onClick={() => { localStorage.removeItem("token"); navigate("/"); }} style={{ fontSize: "14px", color: "#C0392B", fontWeight: "500", cursor: "pointer", marginLeft: "auto" }}>Logout</span>
      </div>

      <div className="suite-detail-content" style={{ padding: "24px 28px" }}>

        {/* ── Action buttons ── */}
        <div className="suite-detail-actions" style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
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
          <button onClick={() => setShowDuration(s => !s)}
            style={{ padding: "10px 20px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
            ⏱ Set duration ({suite.duration || 30} min)
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
          {/* Feature 9 */}
          <button onClick={() => setShowDateWindow(s => !s)}
            style={{ padding: "10px 20px", background: WHITE, color: "#6366f1", border: "1px solid #c7d2fe", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
            📅 Availability window
          </button>
          <button onClick={() => navigate(`/admin/results?suite=${suiteId}`)}
            style={{ padding: "10px 20px", background: WHITE, color: "#333", border: "1px solid #ddd", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
            View results
          </button>
        </div>

        {/* ── Duration Panel ── */}
        {showDuration && (
          <div style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: GREEN_DARK, marginTop: 0, marginBottom: "14px" }}>⏱ Test Duration</h2>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input type="number" min={1} max={300} value={durationVal} onChange={e => setDurationVal(e.target.value)} style={{ ...inputStyle, width: "120px" }} />
              <span style={{ fontSize: "14px", color: "#666" }}>minutes</span>
              <button onClick={handleSaveDuration} disabled={savingDur} style={{ padding: "10px 20px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: savingDur ? 0.6 : 1 }}>
                {savingDur ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowDuration(false)} style={{ padding: "10px 16px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            </div>
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
                    <button type="button" onClick={() => setSelectedQuestionIds(questions.map(q => q._id))} style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #fcd34d", background: WHITE, color: "#92400e", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Select all</button>
                    <button type="button" onClick={() => setSelectedQuestionIds([])} style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #ddd", background: WHITE, color: "#555", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Clear</button>
                  </div>
                </div>
                <div style={{ maxHeight: "300px", overflow: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "4px" }}>
                  {questions.map((q, index) => {
                    const checked = selectedQuestionIds.includes(q._id);
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
                          <strong>Q{index + 1}.</strong> {q.questionText}
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
        {showForm && (
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
            <p style={{ color: "#aaa", fontSize: "14px", margin: 0 }}>No questions yet. Click "+ Add question" to start.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {Object.entries(grouped).map(([cat, qs]) => (
              <div key={cat}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#8A8A7E", letterSpacing: "0.08em", textTransform: "uppercase" }}>{cat}</span>
                  <span style={{ fontSize: "11px", background: "#E8F2EC", color: GREEN, padding: "2px 8px", borderRadius: "999px", fontWeight: "600" }}>{qs.length}</span>
                  <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {qs.map((q, idx) => {
                    const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
                    const catArr     = Array.isArray(q.category) ? q.category : (q.category ? [q.category] : []);
                    const categoryAnswerMap = getCategoryAnswerMap(q);
                    const theory = isTheoryQuestion(q);
                    return (
                      <div key={q._id}
                        style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "14px", padding: "16px 18px", transition: "border-color 0.2s" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = GREEN}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "#e5e7eb"}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                          <div style={{ flex: 1 }}>
                            {catArr.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
                                {catArr.map(c => (
                                  <span key={c} style={{ fontSize: "11px", background: "#E8F2EC", color: GREEN, padding: "2px 8px", borderRadius: "999px", fontWeight: "600" }}>{c}</span>
                                ))}
                              </div>
                            )}
                            <p style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a1a", margin: "0 0 10px" }}>
                              <span style={{ color: "#aaa", marginRight: "6px" }}>Q{idx + 1}.</span>{q.questionText}
                            </p>
                            {theory ? (
                              <div style={{ background: "#f8faf9", border: "1px solid #d8e9df", color: GREEN_DARK, borderRadius: "8px", padding: "8px 10px", fontSize: "13px", fontWeight: "600" }}>
                                Theory question - written answer
                              </div>
                            ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                              {q.options.map((opt, i) => {
                                const isCorrect = correctArr.includes(i);
                                return (
                                  <p key={i} style={{ fontSize: "13px", margin: 0, padding: "6px 10px", borderRadius: "8px", background: isCorrect ? "#dcfce7" : "#f9fafb", color: isCorrect ? "#166534" : "#555", fontWeight: isCorrect ? "600" : "400" }}>
                                    {String.fromCharCode(65 + i)}. {opt} {isCorrect ? "✓" : ""}
                                  </p>
                                );
                              })}
                            </div>
                            )}
                            {q.explanation && <p style={{ fontSize: "12px", color: "#888", marginTop: "8px", marginBottom: 0, fontStyle: "italic" }}>💡 {q.explanation}</p>}
                            <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "11px", background: "#f3f4f6", color: "#555", padding: "2px 8px", borderRadius: "999px" }}>{q.marks ?? 1} mark{(q.marks ?? 1) !== 1 ? "s" : ""}</span>
                              <span style={{ fontSize: "11px", background: theory ? "#dbeafe" : "#dcfce7", color: theory ? "#1d4ed8" : "#166534", padding: "2px 8px", borderRadius: "999px", fontWeight: "600" }}>{theory ? "Theory" : "MCQ"}</span>
                              {!theory && correctArr.length > 1 && <span style={{ fontSize: "11px", background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "999px" }}>Multiple correct</span>}
                            </div>
                            {!theory && catArr.length > 0 && Object.keys(categoryAnswerMap).length > 0 && (
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
                          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                            <button onClick={() => handleEdit(q)} style={{ padding: "6px 12px", fontSize: "12px", fontWeight: "600", background: WHITE, color: GREEN, border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Edit</button>
                            <button onClick={() => handleDeleteQuestion(q._id)} style={{ padding: "6px 12px", fontSize: "12px", fontWeight: "600", background: WHITE, color: "#dc2626", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Delete</button>
                          </div>
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
