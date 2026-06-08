// src/pages/TestSuiteDetail.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API        = import.meta.env.VITE_API_URL || "http://localhost:5000";
const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

const emptyForm = {
  questionText:   "",
  options:        ["", "", "", ""],
  correctAnswers: [],
  explanation:    "",
  marks:          1,
  categories:     [],
};

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
  const [qtsServeVal, setQtsServeVal]     = useState("");
  const [savingQts, setSavingQts]         = useState(false);

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
      const [suiteRes, qRes] = await Promise.all([
        axios.get(`${API}/api/test-suites/${suiteId}`),
        axios.get(`${API}/api/test-suites/${suiteId}/questions`),
      ]);
      setSuite(suiteRes.data);
      setDurationVal(suiteRes.data.duration || 30);
      setQtsServeVal(suiteRes.data.questionsToServe || "");
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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", file);
      await axios.post(`${API}/api/test-suites/${suiteId}/import`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });
      await fetchData();
      alert("Questions imported successfully!");
    } catch (err) {
      alert(err.response?.data?.message || "Import failed");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleSaveDuration = async () => {
    if (!durationVal || durationVal < 1) return alert("Please enter a valid duration");
    setSavingDur(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/api/test-suites/${suiteId}`,
        { duration: Number(durationVal) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuite(prev => ({ ...prev, duration: Number(durationVal) }));
      setShowDuration(false);
      alert("Duration saved!");
    } catch { alert("Failed to save duration"); }
    finally { setSavingDur(false); }
  };

  // Feature 5: Save questionsToServe
  const handleSaveQtsServe = async () => {
    setSavingQts(true);
    try {
      const token = localStorage.getItem("token");
      const value = qtsServeVal ? Number(qtsServeVal) : null;
      await axios.put(`${API}/api/test-suites/${suiteId}`,
        { questionsToServe: value },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuite(prev => ({ ...prev, questionsToServe: value }));
      setShowQtsServe(false);
      alert(value ? `Set to serve ${value} random questions!` : "Serving all questions.");
    } catch { alert("Failed to save."); }
    finally { setSavingQts(false); }
  };

  // Feature 9: Save date window
  const handleSaveDates = async () => {
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return alert("End date must be after start date.");
    }
    setSavingDates(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/api/test-suites/${suiteId}`,
        {
          startDate: startDate || null,
          endDate:   endDate   || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
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
    setForm(f => ({ ...f, categories: f.categories.filter(c => c !== cat) }));
  };

  const toggleCategory = (cat) => {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat],
    }));
  };

  const toggleCorrectAnswer = (index) => {
    setForm(f => ({
      ...f,
      correctAnswers: f.correctAnswers.includes(index)
        ? f.correctAnswers.filter(i => i !== index)
        : [...f.correctAnswers, index],
    }));
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
    });
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.questionText.trim()) return setError("Question text is required");
    const trimmedOptions = form.options.map(o => o.trim()).filter(Boolean);
    if (trimmedOptions.length < 2) return setError("At least 2 options are required");
    if (form.correctAnswers.length === 0) return setError("Select at least one correct answer");
    if (form.categories.length === 0) return setError("Please select at least one category");

    const remappedCorrect = [];
    let currentNewIdx = 0;
    form.options.forEach((opt, oldIdx) => {
      if (opt.trim()) {
        if (form.correctAnswers.includes(oldIdx)) remappedCorrect.push(currentNewIdx);
        currentNewIdx++;
      }
    });

    const payload = {
      questionText:  form.questionText.trim(),
      options:       trimmedOptions,
      correctAnswer: remappedCorrect,
      explanation:   form.explanation.trim(),
      marks:         Number(form.marks) || 1,
      category:      form.categories,
      testSuite:     suiteId,
    };

    setSaving(true);
    try {
      const token  = localStorage.getItem("token");
      const config = { headers: { Authorization: `Bearer ${token}` } };
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
    setForm({
      questionText:   q.questionText,
      options:        opts,
      correctAnswers: Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer],
      explanation:    q.explanation || "",
      marks:          q.marks || 1,
      categories:     Array.isArray(q.category) ? q.category : (q.category ? [q.category] : []),
    });
    setEditingQ(q._id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await axios.delete(`${API}/api/questions/${qId}`);
      setQuestions(prev => prev.filter(q => q._id !== qId));
    } catch { alert("Failed to delete question."); }
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
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFileChange} />

      {/* ── Top bar ── */}
      <div style={{ padding: "16px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
      <div style={{ padding: "12px 28px", display: "flex", gap: "24px", alignItems: "center", borderBottom: "0.5px solid rgba(0,0,0,0.09)", marginTop: "4px" }}>
        <span onClick={() => navigate("/dashboard")} style={{ fontSize: "14px", color: "#4A7A5C", fontWeight: "500", cursor: "pointer" }}>← Back to dashboard</span>
        <span style={{ fontSize: "13px", color: "#aaa" }}>{questions.length} question{questions.length !== 1 ? "s" : ""}</span>
        <span style={{ fontSize: "13px", color: "#aaa" }}>⏱ {suite.duration || 30} min</span>
        {suite.questionsToServe && (
          <span style={{ fontSize: "13px", color: "#f59e0b" }}>🎲 {suite.questionsToServe} random</span>
        )}
        {suite.startDate && (
          <span style={{ fontSize: "13px", color: "#6366f1" }}>
            📅 {new Date(suite.startDate).toLocaleDateString()} – {suite.endDate ? new Date(suite.endDate).toLocaleDateString() : "∞"}
          </span>
        )}
        <span onClick={() => { localStorage.removeItem("token"); navigate("/"); }} style={{ fontSize: "14px", color: "#C0392B", fontWeight: "500", cursor: "pointer", marginLeft: "auto" }}>Logout</span>
      </div>

      <div style={{ padding: "24px 28px" }}>

        {/* ── Action buttons ── */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
          <button onClick={() => { setEditingQ(null); setForm(emptyForm); setError(""); setShowForm(s => !s); }}
            style={{ padding: "10px 20px", background: showForm && !editingQ ? "#555" : GREEN, color: WHITE, border: "none", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
            {showForm && !editingQ ? "Cancel" : "+ Add question"}
          </button>
          <button onClick={handleImportClick} disabled={importing}
            style={{ padding: "10px 20px", background: WHITE, color: GREEN, border: `1.5px solid ${GREEN}`, borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: importing ? 0.6 : 1 }}>
            {importing ? "Importing…" : "⬆️ Import Questions"}
          </button>
          <button onClick={() => setShowCatManager(s => !s)}
            style={{ padding: "10px 20px", background: WHITE, color: GREEN, border: `1.5px solid ${GREEN}`, borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
            🏷️ Manage categories {categories.length > 0 ? `(${categories.length})` : ""}
          </button>
          <button onClick={() => setShowDuration(s => !s)}
            style={{ padding: "10px 20px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
            ⏱ Set duration ({suite.duration || 30} min)
          </button>
          {/* Feature 5 */}
          <button onClick={() => setShowQtsServe(s => !s)}
            style={{ padding: "10px 20px", background: WHITE, color: "#f59e0b", border: "1px solid #fcd34d", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
            🎲 Random questions {suite.questionsToServe ? `(${suite.questionsToServe})` : "(all)"}
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

        {/* ── Feature 5: Questions to Serve Panel ── */}
        {showQtsServe && (
          <div style={{ background: WHITE, border: "1px solid #fcd34d", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: "#92400e", marginTop: 0, marginBottom: "6px" }}>🎲 Random Questions per Candidate</h2>
            <p style={{ fontSize: "13px", color: "#888", marginBottom: "14px" }}>
              You have {questions.length} questions. Set how many each candidate gets randomly. Leave blank to serve all.
            </p>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                type="number" min={1} max={questions.length}
                placeholder={`Max ${questions.length}`}
                value={qtsServeVal}
                onChange={e => setQtsServeVal(e.target.value)}
                style={{ ...inputStyle, width: "140px" }}
              />
              <span style={{ fontSize: "14px", color: "#666" }}>questions per candidate</span>
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
                <label style={labelStyle}>Categories * (select all that apply)</label>
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
              <div>
                <label style={labelStyle}>Options * — check all correct answers</label>
                <div style={{ fontSize: "12px", color: "#888", marginBottom: "10px" }}>Use checkboxes to mark one or more correct answers</div>
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
              </div>
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
                            {q.explanation && <p style={{ fontSize: "12px", color: "#888", marginTop: "8px", marginBottom: 0, fontStyle: "italic" }}>💡 {q.explanation}</p>}
                            <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "11px", background: "#f3f4f6", color: "#555", padding: "2px 8px", borderRadius: "999px" }}>{q.marks ?? 1} mark{(q.marks ?? 1) !== 1 ? "s" : ""}</span>
                              {correctArr.length > 1 && <span style={{ fontSize: "11px", background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "999px" }}>Multiple correct</span>}
                            </div>
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