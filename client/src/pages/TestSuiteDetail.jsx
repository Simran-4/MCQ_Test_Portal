// src/pages/TestSuiteDetail.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

const emptyForm = {
  questionText:  "",
  options:       ["", "", "", ""],
  correctAnswer: 0,
  explanation:   "",
  marks:         1,
  category:      "",
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

  // ── Duration editor state ──
  const [showDuration, setShowDuration]   = useState(false);
  const [durationVal, setDurationVal]     = useState(30);
  const [savingDur, setSavingDur]         = useState(false);

  // ── Category manager state ──
  const [categories, setCategories]       = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`cats_${suiteId}`)) || [];
    } catch { return []; }
  });
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatInput, setNewCatInput]       = useState("");
  const [catError, setCatError]             = useState("");

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
      setQuestions(qRes.data);
      const existingCats = [...new Set(qRes.data.map(q => q.category).filter(Boolean))];
      setCategories(prev => [...new Set([...prev, ...existingCats])]);
    } catch (err) {
      console.error("Failed to fetch suite data:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── Save duration ──
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
    } catch (err) {
      alert("Failed to save duration");
    } finally {
      setSavingDur(false);
    }
  };

  // ── Category manager handlers ──
  const handleAddCategory = () => {
    const name = newCatInput.trim();
    if (!name) { setCatError("Category name cannot be empty"); return; }
    if (categories.includes(name)) { setCatError("Category already exists"); return; }
    setCategories(prev => [...prev, name]);
    setNewCatInput("");
    setCatError("");
  };

  const handleDeleteCategory = (cat) => {
    const usedInQuestion = questions.some(q => q.category === cat);
    if (usedInQuestion && !window.confirm(`"${cat}" is used by some questions. Remove it from the list anyway?`)) return;
    setCategories(prev => prev.filter(c => c !== cat));
    if (form.category === cat) setForm(f => ({ ...f, category: "" }));
  };

  // ── Option handlers ──
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
    const opts    = form.options.filter((_, i) => i !== index);
    const correct = form.correctAnswer >= opts.length ? 0 : form.correctAnswer;
    setForm({ ...form, options: opts, correctAnswer: correct });
  };

  // ── Submit question ──
  const handleSubmit = async () => {
    setError("");
    if (!form.questionText.trim()) { setError("Question text is required"); return; }
    const filledOptions = form.options.filter(o => o.trim());
    if (filledOptions.length < 2) { setError("At least 2 options are required"); return; }
    if (!form.options[form.correctAnswer]?.trim()) { setError("Please select a valid correct answer"); return; }

    const trimmedOptions = form.options.map(o => o.trim()).filter(Boolean);
    const correctIndex   = form.options
      .slice(0, form.correctAnswer + 1)
      .filter(o => o.trim()).length - 1;

    const payload = {
      questionText:  form.questionText.trim(),
      options:       trimmedOptions,
      correctAnswer: Math.max(0, correctIndex),
      explanation:   form.explanation,
      marks:         form.marks,
      category:      form.category,
    };

    setSaving(true);
    try {
      if (editingQ) {
        const res = await axios.put(`${API}/api/questions/${editingQ}`, payload);
        setQuestions(prev => prev.map(q => q._id === editingQ ? res.data : q));
        setEditingQ(null);
      } else {
        const res = await axios.post(`${API}/api/test-suites/${suiteId}/questions`, payload);
        setQuestions(prev => [...prev, res.data]);
      }
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (q) => {
    setForm({
      questionText:  q.questionText,
      options:       q.options.length < 4
                       ? [...q.options, ...Array(4 - q.options.length).fill("")]
                       : q.options,
      correctAnswer: q.correctAnswer,
      explanation:   q.explanation || "",
      marks:         q.marks || 1,
      category:      q.category || "",
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
    const cat = q.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(q);
    return acc;
  }, {});

  if (loading) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", color: "#aaa" }}>Loading…</div>
  );
  if (!suite) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", color: "#dc2626" }}>Test suite not found.</div>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{ padding: "16px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: WHITE, border: "0.5px solid rgba(0,0,0,0.1)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="Logo" style={{ width: "48px", height: "48px", objectFit: "contain" }} onError={e => { e.target.style.display = "none"; }} />
          </div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: GREEN_DARK, lineHeight: 1.2 }}>{suite.name}</div>
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
        <span onClick={() => { localStorage.removeItem("token"); navigate("/"); }} style={{ fontSize: "14px", color: "#C0392B", fontWeight: "500", cursor: "pointer", marginLeft: "auto" }}>Logout</span>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "24px 28px" }}>

        {/* ── Action buttons ── */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
          <button
            onClick={() => { setEditingQ(null); setForm(emptyForm); setError(""); setShowForm(s => !s); }}
            style={{ padding: "10px 20px", background: showForm && !editingQ ? "#555" : GREEN, color: WHITE, border: "none", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}
          >
            {showForm && !editingQ ? "Cancel" : "+ Add question"}
          </button>
          <button
            onClick={() => setShowCatManager(s => !s)}
            style={{ padding: "10px 20px", background: WHITE, color: GREEN, border: `1.5px solid ${GREEN}`, borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}
          >
            🏷️ Manage categories {categories.length > 0 ? `(${categories.length})` : ""}
          </button>
          {/* ── Duration button ── */}
          <button
            onClick={() => setShowDuration(s => !s)}
            style={{ padding: "10px 20px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}
          >
            ⏱ Set duration ({suite.duration || 30} min)
          </button>
          <button
            onClick={() => navigate(`/admin/results?suite=${suiteId}`)}
            style={{ padding: "10px 20px", background: WHITE, color: "#333", border: "1px solid #ddd", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}
          >
            View results
          </button>
        </div>

        {/* ── Duration Panel ── */}
        {showDuration && (
          <div style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: GREEN_DARK, marginTop: 0, marginBottom: "14px" }}>⏱ Test Duration</h2>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                type="number"
                min={1}
                max={300}
                value={durationVal}
                onChange={e => setDurationVal(e.target.value)}
                style={{ ...inputStyle, width: "120px" }}
              />
              <span style={{ fontSize: "14px", color: "#666" }}>minutes</span>
              <button
                onClick={handleSaveDuration}
                disabled={savingDur}
                style={{ padding: "10px 20px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: savingDur ? 0.6 : 1 }}
              >
                {savingDur ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setShowDuration(false)}
                style={{ padding: "10px 16px", background: WHITE, color: "#555", border: "1px solid #ddd", borderRadius: "10px", fontSize: "14px", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Category Manager Panel ── */}
        {showCatManager && (
          <div style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "700", color: GREEN_DARK, marginTop: 0, marginBottom: "14px" }}>🏷️ Your Categories</h2>
            <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Type a new category name…"
                value={newCatInput}
                onChange={e => { setNewCatInput(e.target.value); setCatError(""); }}
                onKeyDown={e => e.key === "Enter" && handleAddCategory()}
              />
              <button onClick={handleAddCategory} style={{ padding: "10px 20px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>
                + Add
              </button>
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
                <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Enter the question text here…" value={form.questionText} onChange={e => setForm({ ...form, questionText: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                {categories.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "#aaa", margin: 0 }}>
                    No categories yet.{" "}
                    <span onClick={() => setShowCatManager(true)} style={{ color: GREEN, cursor: "pointer", fontWeight: "600", textDecoration: "underline" }}>Add categories first →</span>
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setForm(f => ({ ...f, category: f.category === cat ? "" : cat }))}
                        style={{
                          padding: "6px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: "600", cursor: "pointer", border: "1.5px solid",
                          background:  form.category === cat ? GREEN : WHITE,
                          color:       form.category === cat ? WHITE : GREEN,
                          borderColor: form.category === cat ? GREEN : "#c8dfd0",
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Options * — select the correct answer</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {form.options.map((opt, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <input type="radio" name="correct" checked={form.correctAnswer === i} onChange={() => setForm({ ...form, correctAnswer: i })} style={{ accentColor: GREEN, width: "16px", height: "16px", flexShrink: 0 }} />
                      <input style={{ ...inputStyle, flex: 1, width: "auto" }} placeholder={`Option ${i + 1}${i >= 2 ? " (optional)" : ""}`} value={opt} onChange={e => handleOptionChange(i, e.target.value)} />
                      {form.correctAnswer === i && <span style={{ fontSize: "12px", color: GREEN, fontWeight: "600", whiteSpace: "nowrap", minWidth: "60px" }}>✓ Correct</span>}
                      {form.options.length > 2 && (
                        <button onClick={() => removeOption(i)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: "20px", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
                {form.options.length < 6 && (
                  <button onClick={addOption} style={{ marginTop: "10px", padding: "7px 16px", background: "none", border: `1px dashed ${GREEN}`, borderRadius: "10px", color: GREEN, fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                    + Add option
                  </button>
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

        {/* ── Questions grouped by category ── */}
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
                  {qs.map((q, idx) => (
                    <div key={q._id}
                      style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "14px", padding: "16px 18px", transition: "border-color 0.2s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = GREEN}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "#e5e7eb"}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a1a", margin: "0 0 10px" }}>
                            <span style={{ color: "#aaa", marginRight: "6px" }}>Q{idx + 1}.</span>{q.questionText}
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                            {q.options.map((opt, i) => (
                              <p key={i} style={{ fontSize: "13px", margin: 0, padding: "6px 10px", borderRadius: "8px", background: i === q.correctAnswer ? "#dcfce7" : "#f9fafb", color: i === q.correctAnswer ? "#166534" : "#555", fontWeight: i === q.correctAnswer ? "600" : "400" }}>
                                {String.fromCharCode(65 + i)}. {opt}
                              </p>
                            ))}
                          </div>
                          {q.explanation && <p style={{ fontSize: "12px", color: "#888", marginTop: "8px", marginBottom: 0, fontStyle: "italic" }}>💡 {q.explanation}</p>}
                          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                            <span style={{ fontSize: "11px", background: "#f3f4f6", color: "#555", padding: "2px 8px", borderRadius: "999px" }}>{q.marks ?? 1} mark{(q.marks ?? 1) !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                          <button onClick={() => handleEdit(q)} style={{ padding: "6px 12px", fontSize: "12px", fontWeight: "600", background: WHITE, color: GREEN, border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Edit</button>
                          <button onClick={() => handleDeleteQuestion(q._id)} style={{ padding: "6px 12px", fontSize: "12px", fontWeight: "600", background: WHITE, color: "#dc2626", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}