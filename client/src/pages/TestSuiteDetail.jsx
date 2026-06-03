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
  questionText: "",
  options: ["", "", "", ""],
  correctAnswer: 0,
  explanation: "",
  marks: 1,
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

  useEffect(() => { fetchData(); }, [suiteId]);

  const fetchData = async () => {
    try {
      const [suiteRes, qRes] = await Promise.all([
        axios.get(`${API}/api/test-suites/${suiteId}`),
        axios.get(`${API}/api/test-suites/${suiteId}/questions`),
      ]);
      setSuite(suiteRes.data);
      setQuestions(qRes.data);
    } catch (err) {
      console.error("Failed to fetch suite data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionChange = (index, value) => {
    const opts = [...form.options];
    opts[index] = value;
    setForm({ ...form, options: opts });
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.questionText.trim()) { setError("Question text is required"); return; }
    if (form.options.some(o => !o.trim())) { setError("All options must be filled"); return; }
    setSaving(true);
    try {
      const res = await axios.post(`${API}/api/test-suites/${suiteId}/questions`, form);
      setQuestions(prev => [...prev, res.data]);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await axios.delete(`${API}/api/questions/${qId}`);
      setQuestions(prev => prev.filter(q => q._id !== qId));
    } catch {
      alert("Failed to delete question.");
    }
  };

  const inputStyle = {
    width: "100%", border: "1px solid #ddd", borderRadius: "10px",
    padding: "10px 12px", fontSize: "14px", outline: "none",
    boxSizing: "border-box", fontFamily: "inherit", background: WHITE,
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", color: "#aaa" }}>
      Loading…
    </div>
  );

  if (!suite) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", color: "#dc2626" }}>
      Test suite not found.
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{ padding: "16px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: WHITE, border: "0.5px solid rgba(0,0,0,0.1)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <img
              src={`${import.meta.env.BASE_URL}Logo.png`}
              alt="Snehalaya"
              style={{ width: "48px", height: "48px", objectFit: "contain" }}
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: GREEN_DARK, lineHeight: 1.2 }}>
              {suite.name}
            </div>
            {suite.description && (
              <div style={{ fontSize: "13px", color: "#6B6B5E", marginTop: "2px" }}>{suite.description}</div>
            )}
          </div>
        </div>
        <span style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "999px", fontWeight: "600", background: "#dcfce7", color: "#166534" }}>
          {suite.status}
        </span>
      </div>

      {/* ── Nav ── */}
      <div style={{ padding: "12px 28px", display: "flex", gap: "24px", alignItems: "center", borderBottom: "0.5px solid rgba(0,0,0,0.09)", marginTop: "4px" }}>
        <span
          onClick={() => navigate("/dashboard")}
          style={{ fontSize: "14px", color: "#4A7A5C", fontWeight: "500", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
        >
          ← Back to dashboard
        </span>
        <span style={{ fontSize: "13px", color: "#aaa" }}>
          {questions.length} question{questions.length !== 1 ? "s" : ""}
        </span>
        <span
          onClick={() => { localStorage.removeItem("token"); navigate("/"); }}
          style={{ fontSize: "14px", color: "#C0392B", fontWeight: "500", cursor: "pointer", marginLeft: "auto" }}
        >
          Logout
        </span>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "24px 28px" }}>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ padding: "10px 20px", background: GREEN, color: WHITE, border: "none", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = GREEN_DARK}
            onMouseLeave={e => e.currentTarget.style.background = GREEN}
          >
            {showForm ? "Cancel" : "+ Add question"}
          </button>
          <button
            onClick={() => navigate(`/admin/results?suite=${suiteId}`)}
            style={{ padding: "10px 20px", background: WHITE, color: "#333", border: "1px solid #ddd", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}
          >
            View results
          </button>
        </div>

        {/* ── Add Question Form ── */}
        {showForm && (
          <div style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "16px", padding: "24px", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "700", color: GREEN_DARK, marginBottom: "16px", marginTop: 0 }}>New question</h2>

            {error && <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Question *</label>
                <textarea
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="Enter the question text here…"
                  value={form.questionText}
                  onChange={e => setForm({ ...form, questionText: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "8px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Options * — select the correct answer</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {form.options.map((opt, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <input
                        type="radio"
                        name="correct"
                        checked={form.correctAnswer === i}
                        onChange={() => setForm({ ...form, correctAnswer: i })}
                        style={{ accentColor: GREEN, width: "16px", height: "16px", flexShrink: 0 }}
                      />
                      <input
                        style={{ ...inputStyle, flex: 1, width: "auto" }}
                        placeholder={`Option ${i + 1}`}
                        value={opt}
                        onChange={e => handleOptionChange(i, e.target.value)}
                      />
                      {form.correctAnswer === i && (
                        <span style={{ fontSize: "12px", color: GREEN, fontWeight: "600", whiteSpace: "nowrap" }}>✓ Correct</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Explanation (optional)</label>
                  <input
                    style={inputStyle}
                    placeholder="Why is this the correct answer?"
                    value={form.explanation}
                    onChange={e => setForm({ ...form, explanation: e.target.value })}
                  />
                </div>
                <div style={{ width: "90px" }}>
                  <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Marks</label>
                  <input
                    type="number"
                    min={1}
                    style={inputStyle}
                    value={form.marks}
                    onChange={e => setForm({ ...form, marks: Number(e.target.value) })}
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{ alignSelf: "flex-start", padding: "10px 24px", background: GREEN, color: WHITE, border: "none", borderRadius: "22px", fontSize: "14px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Saving…" : "Save question"}
              </button>
            </div>
          </div>
        )}

        {/* ── Questions List ── */}
        {questions.length === 0 ? (
          <div style={{ background: WHITE, borderRadius: "16px", border: "2px dashed #e5e7eb", padding: "48px 28px", textAlign: "center" }}>
            <p style={{ color: "#aaa", fontSize: "14px", margin: 0 }}>No questions yet. Click "+ Add question" to start.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {questions.map((q, idx) => (
              <div key={q._id} style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "14px", padding: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a1a", margin: "0 0 10px" }}>
                      <span style={{ color: "#aaa", marginRight: "6px" }}>Q{idx + 1}.</span>
                      {q.questionText}
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      {q.options.map((opt, i) => (
                        <p key={i} style={{
                          fontSize: "13px", margin: 0, padding: "6px 10px", borderRadius: "8px",
                          background: i === q.correctAnswer ? "#dcfce7" : "#f9fafb",
                          color: i === q.correctAnswer ? "#166534" : "#555",
                          fontWeight: i === q.correctAnswer ? "600" : "400",
                        }}>
                          {String.fromCharCode(65 + i)}. {opt}
                        </p>
                      ))}
                    </div>
                    {q.explanation && (
                      <p style={{ fontSize: "12px", color: "#888", marginTop: "8px", marginBottom: 0, fontStyle: "italic" }}>
                        💡 {q.explanation}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteQuestion(q._id)}
                    style={{ padding: "6px 12px", fontSize: "12px", fontWeight: "600", background: WHITE, color: "#dc2626", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer", flexShrink: 0 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}