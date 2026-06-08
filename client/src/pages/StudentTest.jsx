// src/pages/StudentTest.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

// ── Scoring helpers ──────────────────────────────────────────
function scoreQuestion(q, selectedArr) {
  const correctArr   = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
  const totalCorrect = correctArr.length;
  const hits         = selectedArr.filter(i => correctArr.includes(i)).length;
  const wrongs       = selectedArr.filter(i => !correctArr.includes(i)).length;
  const earnedFrac   = Math.max(0, (hits - wrongs) / totalCorrect);
  return { earnedFrac, isRight: earnedFrac === 1, correctArr };
}

function buildCategoryStats(questions, answers) {
  const cats = {};
  questions.forEach(q => {
    const cat = q.category || "Uncategorized";
    if (!cats[cat]) cats[cat] = { total: 0, correct: 0, marks: 0, earnedMarks: 0 };
    const marks       = q.marks ?? 1;
    const selectedArr = Array.isArray(answers[q._id]) ? answers[q._id] : [];
    const { earnedFrac, isRight } = scoreQuestion(q, selectedArr);
    cats[cat].total       += 1;
    cats[cat].marks       += marks;
    cats[cat].earnedMarks += earnedFrac * marks;
    if (isRight) cats[cat].correct += 1;
  });
  return cats;
}

function pctColor(pct) {
  if (pct >= 75) return GREEN;
  if (pct >= 50) return "#f59e0b";
  return "#dc2626";
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function StudentTest() {
  const { suiteId } = useParams();
  const navigate    = useNavigate();

  const [suite, setSuite]           = useState(null);
  const [questions, setQuestions]   = useState([]);
  const [answers, setAnswers]       = useState({});
  const [loading, setLoading]       = useState(true);
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState("");
  const [activeTab, setActiveTab]   = useState("summary");

  const [markedForReview, setMarkedForReview] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passingPct, setPassingPct] = useState(50);

  const [timeLeft, setTimeLeft]       = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const timerRef                      = useRef(null);
  const answersRef                    = useRef(answers);

  useEffect(() => { answersRef.current = answers; }, [answers]);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user")) || {}; }
    catch { return {}; }
  })();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token   = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        const [suiteRes, qRes, settingsRes] = await Promise.all([
          axios.get(`${API}/api/test-suites/${suiteId}`, { headers }),
          axios.get(`${API}/api/test-suites/${suiteId}/questions`, { headers }),
          axios.get(`${API}/api/settings`),
        ]);

        setSuite(suiteRes.data);
        setQuestions(qRes.data);

        const durationMins = settingsRes.data?.examDuration    || 30;
        const passing      = settingsRes.data?.passingPercentage ?? 50;
        setTimeLeft(durationMins * 60);
        setPassingPct(passing);

      } catch (err) {
        console.error("Failed to load test:", err);
        setError("Could not load this test. Please go back and try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [suiteId]);

  useEffect(() => {
    if (timeLeft === null || submitted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          autoSubmit();
          return 0;
        }
        if (prev === 61) setShowWarning(true);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timeLeft, submitted]);

  const autoSubmit = async () => {
    setShowWarning(false);
    handleSubmitInternal(true);
  };

  const handleSelect = (questionId, optionIndex) => {
    if (submitted) return;
    setAnswers(prev => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const already = current.includes(optionIndex);
      const updated = already
        ? current.filter(i => i !== optionIndex)
        : [...current, optionIndex];
      
      const copy = { ...prev };
      if (updated.length === 0) {
        delete copy[questionId];
      } else {
        copy[questionId] = updated;
      }
      return copy;
    });
  };

  const handleMarkForReview = (idx) => {
    setMarkedForReview(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const handleSubmitClick = () => {
    const unanswered = questions.filter(q => !answers[q._id] || answers[q._id].length === 0).length;
    if (unanswered > 0) {
      const firstIdx = questions.findIndex(q => !answers[q._id] || answers[q._id].length === 0);
      document.getElementById(`question-${firstIdx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      alert(`Please answer all questions before submitting.\n\n${unanswered} question(s) still unanswered.`);
      return;
    }
    setShowConfirm(true);
  };

  const handleSubmitInternal = async (isAuto = false) => {
    setShowConfirm(false);
    clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const currentAnswers = isAuto ? answersRef.current : answers;

      let finalScore = 0, totalMarksCount = 0;
      questions.forEach(q => {
        const marks = q.marks ?? 1;
        const selectedArr = Array.isArray(currentAnswers[q._id]) ? currentAnswers[q._id] : [];
        const { earnedFrac } = scoreQuestion(q, selectedArr);
        totalMarksCount += marks;
        finalScore      += earnedFrac * marks;
      });
      const pct    = totalMarksCount > 0 ? Math.round((finalScore / totalMarksCount) * 100) : 0;
      const passed = pct >= passingPct;

      const payload = {
        suiteId,
        CandidateName:  user.name,
        CandidateEmail: user.email,
        project:        user.project     || "General",
        designation:    user.designation || "",
        passed,
        answers: questions.map(q => ({
          questionId:      q._id,
          selectedOptions: currentAnswers[q._id] ?? [],
        })),
      };

      const res = await axios.post(`${API}/api/results`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResult(res.data);
      setSubmitted(true);
    } catch (err) {
      console.error("Submit error:", err);
      alert("Failed to submit. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Results Screen Logic ────────────────────────────────────
  if (submitted && result) {
    const pct = Math.round((result.score / result.totalMarks) * 100) || 0;
    const passed = pct >= passingPct;
    const catStats = buildCategoryStats(questions, answers);
    const catEntries = Object.entries(catStats);

    const handleDownloadCertificate = () => {
      const win = window.open("", "_blank");
      win.document.write(`
        <html>
        <body style="font-family:Georgia,serif;text-align:center;padding:80px;color:#1A3D28;background:#fff;">
          <div style="border:10px double #2D5F3F;padding:50px;">
            <h1>Certificate of Completion</h1>
            <p>This certifies that</p>
            <h2>${user.name}</h2>
            <p>has passed the assessment</p>
            <h3>${suite?.name}</h3>
            <p style="font-size:24px;">Score: ${pct}%</p>
            <p>Date: ${new Date().toLocaleDateString()}</p>
          </div>
          <script>window.print();</script>
        </body>
        </html>
      `);
      win.document.close();
    };

    return (
      <div style={{ minHeight: "100vh", background: BG, padding: "24px 16px" }}>
        <div style={{ maxWidth: "520px", margin: "0 auto" }}>
          <div style={{ background: WHITE, borderRadius: "20px", padding: "32px", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
             <div style={{ fontSize: "48px" }}>{passed ? "🎉" : "📚"}</div>
             <h1 style={{ color: GREEN_DARK }}>{passed ? "Passed!" : "Try Again"}</h1>
             <div style={{ background: BG, borderRadius: "14px", padding: "20px", margin: "20px 0" }}>
                <p style={{ fontSize: "12px", color: "#888", textTransform: "uppercase" }}>Your Result</p>
                <p style={{ fontSize: "40px", fontWeight: "800", color: GREEN_DARK, margin: 0 }}>{result.score} / {result.totalMarks}</p>
                <p style={{ fontSize: "24px", color: pctColor(pct), margin: 0 }}>{pct}%</p>
             </div>
             {passed && (
               <button onClick={handleDownloadCertificate} style={{ width: "100%", padding: "12px", background: GREEN, color: WHITE, border: "none", borderRadius: "12px", cursor: "pointer", marginBottom: "12px" }}>
                 🎓 Download Certificate
               </button>
             )}
             <button onClick={() => navigate("/candidate")} style={{ width: "100%", padding: "12px", background: "#f3f4f6", color: "#555", border: "none", borderRadius: "12px", cursor: "pointer" }}>
               Back to Tests
             </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Test Screen UI ──────────────────────────────────────
  const answeredCount = Object.keys(answers).length;
  const isLowTime = timeLeft !== null && timeLeft <= 60;

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Timer Warning */}
      {showWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: WHITE, padding: "30px", borderRadius: "20px", textAlign: "center" }}>
            <h2>⚠️ 1 Minute Left</h2>
            <p>Complete your answers quickly!</p>
            <button onClick={() => setShowWarning(false)} style={{ background: GREEN, color: WHITE, padding: "10px 20px", border: "none", borderRadius: "8px" }}>OK</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: WHITE, padding: "32px", borderRadius: "24px", maxWidth: "400px", textAlign: "center" }}>
            <h3>Submit Assessment?</h3>
            <p>{answeredCount} of {questions.length} answered.</p>
            {markedForReview.length > 0 && <p style={{ color: "#ea580c" }}>⚠️ {markedForReview.length} items still marked for review.</p>}
            <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #ddd" }}>Review</button>
              <button onClick={() => handleSubmitInternal(false)} style={{ flex: 1, padding: "12px", borderRadius: "10px", background: GREEN, color: WHITE, border: "none" }}>Submit Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: WHITE, padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", color: GREEN_DARK }}>{suite?.name}</h2>
          <span style={{ fontSize: "12px", color: "#888" }}>{answeredCount} / {questions.length} Answered</span>
        </div>
        <div style={{ background: isLowTime ? "#fee2e2" : "#f0faf5", padding: "8px 16px", borderRadius: "999px", color: isLowTime ? "#dc2626" : GREEN, fontWeight: "bold" }}>
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Questions */}
      <div style={{ maxWidth: "720px", margin: "24px auto", padding: "0 16px 120px" }}>
        {questions.map((q, idx) => {
          const isMarked = markedForReview.includes(idx);
          const isSelected = (answers[q._id]?.length > 0);
          
          return (
            <div id={`question-${idx}`} key={q._id} style={{ background: WHITE, borderRadius: "16px", padding: "24px", marginBottom: "16px", border: `2px solid ${isMarked ? "#f97316" : isSelected ? "#e8f2ec" : "transparent"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontWeight: "bold", color: "#aaa" }}>Q{idx + 1}</span>
                <button onClick={() => handleMarkForReview(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: isMarked ? "#f97316" : "#ccc", fontSize: "13px" }}>
                  {isMarked ? "★ Marked for Review" : "☆ Mark for Review"}
                </button>
              </div>
              <p style={{ fontSize: "16px", fontWeight: "600", marginBottom: "16px" }}>{q.questionText}</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {q.options.map((opt, oIdx) => (
                  <label key={oIdx} style={{ display: "flex", alignItems: "center", padding: "12px", borderRadius: "10px", background: (answers[q._id] || []).includes(oIdx) ? "#f0faf5" : "#f9fafb", cursor: "pointer", border: "1px solid #eee" }}>
                    <input 
                      type="checkbox" 
                      checked={(answers[q._id] || []).includes(oIdx)} 
                      onChange={() => handleSelect(q._id, oIdx)}
                      style={{ marginRight: "12px", accentColor: GREEN }}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit Footer */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: WHITE, padding: "20px", textAlign: "center", borderTop: "1px solid #eee" }}>
        <button onClick={handleSubmitClick} disabled={submitting} style={{ padding: "14px 60px", background: GREEN, color: WHITE, border: "none", borderRadius: "999px", fontSize: "16px", fontWeight: "bold", cursor: "pointer" }}>
          {submitting ? "Submitting..." : "Finish & Submit"}
        </button>
      </div>
    </div>
  );
}