// src/pages/StudentTest.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

export default function StudentTest() {
  const { suiteId } = useParams();
  const navigate    = useNavigate();

  const [suite, setSuite]         = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers]     = useState({});   // { questionId: selectedIndex }
  const [loading, setLoading]     = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState("");

  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user")) || {}; }
    catch { return {}; }
  })();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };
        const [suiteRes, qRes] = await Promise.all([
          axios.get(`${API}/api/test-suites/${suiteId}`, { headers }),
          axios.get(`${API}/api/test-suites/${suiteId}/questions`, { headers }),
        ]);
        setSuite(suiteRes.data);
        setQuestions(qRes.data);
      } catch (err) {
        console.error("Failed to load test:", err);
        setError("Could not load this test. Please go back and try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [suiteId]);

  const handleSelect = (questionId, optionIndex) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleSubmit = async () => {
    const unanswered = questions.filter(q => answers[q._id] === undefined);
    if (unanswered.length > 0) {
      if (!window.confirm(`You have ${unanswered.length} unanswered question(s). Submit anyway?`)) return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        suiteId,
        studentName: user.name || "Student",
        studentEmail: user.email || "",
        answers: questions.map(q => ({
          questionId: q._id,
          selectedOption: answers[q._id] ?? -1,
        })),
      };
      const res = await axios.post(`${API}/api/results`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResult(res.data);
      setSubmitted(true);
    } catch (err) {
      console.error("Submit error:", err);
      alert(err.response?.data?.message || "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Score screen ──
  if (submitted && result) {
    const pct = Math.round((result.score / result.totalMarks) * 100) || 0;
    const passed = pct >= 50;
    return (
      <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ background: WHITE, borderRadius: "20px", padding: "40px 32px", maxWidth: "420px", width: "100%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "52px", marginBottom: "12px" }}>{passed ? "🎉" : "📚"}</div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: GREEN_DARK, margin: "0 0 6px" }}>
            {passed ? "Great job!" : "Keep practising!"}
          </h1>
          <p style={{ color: "#888", fontSize: "14px", margin: "0 0 24px" }}>{suite?.name}</p>

          <div style={{ background: BG, borderRadius: "14px", padding: "20px", marginBottom: "24px" }}>
            <div style={{ fontSize: "48px", fontWeight: "700", color: passed ? GREEN : "#dc2626" }}>{pct}%</div>
            <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>
              {result.score} / {result.totalMarks} marks
            </div>
            <div style={{ fontSize: "13px", color: "#aaa", marginTop: "4px" }}>
              {result.correctAnswers} correct out of {questions.length} questions
            </div>
          </div>

          {/* Per-question review */}
          <div style={{ textAlign: "left", marginBottom: "24px" }}>
            <p style={{ fontSize: "12px", fontWeight: "700", color: "#8A8A7E", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>Review</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
              {questions.map((q, i) => {
                const selected = answers[q._id] ?? -1;
                const correct  = q.correctAnswer;
                const isRight  = selected === correct;
                return (
                  <div key={q._id} style={{ background: isRight ? "#dcfce7" : "#fee2e2", borderRadius: "10px", padding: "10px 14px" }}>
                    <p style={{ fontSize: "13px", fontWeight: "600", color: "#1a1a1a", margin: "0 0 4px" }}>
                      {isRight ? "✅" : "❌"} Q{i + 1}. {q.questionText}
                    </p>
                    {!isRight && selected !== -1 && (
                      <p style={{ fontSize: "12px", color: "#dc2626", margin: "0 0 2px" }}>
                        Your answer: {q.options[selected]}
                      </p>
                    )}
                    {!isRight && selected === -1 && (
                      <p style={{ fontSize: "12px", color: "#dc2626", margin: "0 0 2px" }}>Not answered</p>
                    )}
                    <p style={{ fontSize: "12px", color: "#166534", margin: 0 }}>
                      Correct: {q.options[correct]}
                    </p>
                    {q.explanation && (
                      <p style={{ fontSize: "12px", color: "#555", margin: "4px 0 0", fontStyle: "italic" }}>💡 {q.explanation}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => navigate("/student")}
            style={{ width: "100%", padding: "12px", fontSize: "15px", fontWeight: "600", background: GREEN, color: WHITE, border: "none", borderRadius: "12px", cursor: "pointer" }}
          >
            Back to Tests
          </button>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", color: "#aaa" }}>
      Loading test…
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: WHITE, borderRadius: "16px", padding: "32px", maxWidth: "360px", textAlign: "center" }}>
        <p style={{ color: "#dc2626", fontSize: "15px" }}>{error}</p>
        <button onClick={() => navigate("/student")} style={{ padding: "10px 24px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
          Go Back
        </button>
      </div>
    </div>
  );

  const answeredCount = Object.keys(answers).length;

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{ padding: "16px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: WHITE, border: "0.5px solid rgba(0,0,0,0.1)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="Logo" style={{ width: "40px", height: "40px", objectFit: "contain" }} onError={e => { e.target.style.display = "none"; }} />
          </div>
          <div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: GREEN_DARK }}>{suite?.name}</div>
            {suite?.description && <div style={{ fontSize: "12px", color: "#6B6B5E" }}>{suite.description}</div>}
          </div>
        </div>
        <div style={{ fontSize: "13px", color: "#888" }}>
          {answeredCount} / {questions.length} answered
        </div>
      </div>

      <div style={{ borderBottom: "0.5px solid rgba(0,0,0,0.09)", margin: "12px 0 0" }} />

      {/* ── Nav ── */}
      <div style={{ padding: "10px 28px", display: "flex", alignItems: "center", gap: "12px" }}>
        <span onClick={() => navigate("/student")} style={{ fontSize: "13px", color: "#4A7A5C", fontWeight: "500", cursor: "pointer" }}>← Back to tests</span>
      </div>

      {/* ── Questions ── */}
      <div style={{ padding: "16px 28px 100px", maxWidth: "720px" }}>
        {questions.length === 0 ? (
          <div style={{ background: WHITE, borderRadius: "16px", padding: "48px", textAlign: "center" }}>
            <p style={{ color: "#aaa" }}>This test has no questions yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {questions.map((q, idx) => (
              <div key={q._id} style={{ background: WHITE, border: `1px solid ${answers[q._id] !== undefined ? GREEN : "#e5e7eb"}`, borderRadius: "14px", padding: "20px", transition: "border-color 0.2s" }}>
                <p style={{ fontSize: "15px", fontWeight: "600", color: "#1a1a1a", margin: "0 0 14px" }}>
                  <span style={{ color: "#aaa", marginRight: "6px" }}>Q{idx + 1}.</span>{q.questionText}
                  <span style={{ fontSize: "11px", color: "#aaa", fontWeight: "400", marginLeft: "8px" }}>({q.marks ?? 1} mark{(q.marks ?? 1) !== 1 ? "s" : ""})</span>
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {q.options.map((opt, i) => {
                    const selected = answers[q._id] === i;
                    return (
                      <button
                        key={i}
                        onClick={() => handleSelect(q._id, i)}
                        style={{
                          textAlign: "left", padding: "10px 14px", borderRadius: "10px", fontSize: "14px", cursor: "pointer", fontFamily: "inherit",
                          border: selected ? `2px solid ${GREEN}` : "1px solid #e5e7eb",
                          background: selected ? "#E8F2EC" : WHITE,
                          color: selected ? GREEN_DARK : "#333",
                          fontWeight: selected ? "600" : "400",
                          transition: "all 0.15s",
                        }}
                      >
                        <span style={{ marginRight: "8px", color: selected ? GREEN : "#aaa", fontWeight: "700" }}>
                          {String.fromCharCode(65 + i)}.
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sticky submit bar ── */}
      {questions.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: WHITE, borderTop: "1px solid #e5e7eb", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "13px", color: "#888" }}>
            <span style={{ fontWeight: "700", color: answeredCount === questions.length ? GREEN : "#f59e0b" }}>{answeredCount}</span>
            /{questions.length} answered
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ padding: "12px 28px", fontSize: "15px", fontWeight: "600", background: GREEN, color: WHITE, border: "none", borderRadius: "12px", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1, transition: "background 0.2s" }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = GREEN_DARK; }}
            onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = GREEN; }}
          >
            {submitting ? "Submitting…" : "Submit Test"}
          </button>
        </div>
      )}
    </div>
  );
}
