// src/pages/StudentTest.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { getAuthHeaders } from "../utils/auth";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";
const ORANGE     = "#f97316";

// ── Helper: get categories for a question (always returns array) ──
function getQuestionCats(q) {
  if (Array.isArray(q.category) && q.category.length > 0) return q.category;
  if (typeof q.category === "string" && q.category.trim()) return [q.category.trim()];
  return ["Uncategorized"];
}

// ── Scoring helpers ──────────────────────────────────────────
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

function scoreAnswers(selectedArr, correctArr) {
  const totalCorrect = correctArr.length;
  if (totalCorrect === 0) return { earnedFrac: 0, isRight: false, correctArr };
  const hits         = selectedArr.filter(i => correctArr.includes(i)).length;
  const wrongs       = selectedArr.filter(i => !correctArr.includes(i)).length;
  const earnedFrac   = Math.max(0, (hits - wrongs) / totalCorrect);
  return { earnedFrac, isRight: earnedFrac === 1, correctArr };
}

function scoreQuestion(q, selectedArr) {
  const cats = getQuestionCats(q);
  const categoryScores = cats.map(cat => scoreAnswers(selectedArr, getCorrectAnswersForCategory(q, cat)));
  const best = categoryScores.reduce((winner, current) =>
    current.earnedFrac > winner.earnedFrac ? current : winner,
    { earnedFrac: 0, isRight: false, correctArr: [] }
  );
  return best;
}

function getSingleSelectedOption(answer) {
  return Array.isArray(answer) && Number.isInteger(answer[0]) ? answer[0] : null;
}

function isTheoryQuestion(q) {
  return q?.questionType === "theory";
}

function isQuestionAnswered(q, answers) {
  const answer = answers[q._id];
  if (isTheoryQuestion(q)) return typeof answer === "string" && answer.trim().length > 0;
  return Array.isArray(answer) && answer.length > 0;
}

// FIXED: each question's marks/score count toward ALL its categories
function buildCategoryStats(questions, answers) {
  const cats = {};
  questions.forEach(q => {
    if (isTheoryQuestion(q)) return;
    const questionCats = getQuestionCats(q);
    const marks        = q.marks ?? 1;
    const selectedOption = getSingleSelectedOption(answers[q._id]);
    const selectedArr = selectedOption === null ? [] : [selectedOption];

    questionCats.forEach(cat => {
      const { earnedFrac, isRight } = scoreAnswers(selectedArr, getCorrectAnswersForCategory(q, cat));
      if (!cats[cat]) cats[cat] = { total: 0, correct: 0, marks: 0, earnedMarks: 0 };
      cats[cat].total       += 1;
      cats[cat].marks       += marks;
      cats[cat].earnedMarks += earnedFrac * marks;
      if (isRight) cats[cat].correct += 1;
    });
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

  const [markedForReview, setMarkedForReview] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passingPct, setPassingPct]   = useState(50);
  const [currentQuestion, setCurrentQuestion] = useState(0);

  const [timeLeft, setTimeLeft]       = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const timerRef                      = useRef(null);
  const answersRef                    = useRef(answers);

  useEffect(() => { answersRef.current = answers; }, [answers]);

  useEffect(() => {
    setAnswers(prev => {
      const normalized = {};
      Object.entries(prev).forEach(([questionId, selected]) => {
        const q = questions.find(item => item._id === questionId);
        if (isTheoryQuestion(q)) {
          if (typeof selected === "string" && selected.trim()) normalized[questionId] = selected;
          return;
        }
        const selectedOption = getSingleSelectedOption(selected);
        if (selectedOption !== null) normalized[questionId] = [selectedOption];
      });
      const alreadyNormalized = Object.keys(normalized).length === Object.keys(prev).length &&
        Object.entries(normalized).every(([questionId, selected]) => {
          const previous = prev[questionId];
          if (typeof selected === "string") return selected === previous;
          return Array.isArray(previous) && previous.length === 1 && selected[0] === previous[0];
        });
      return alreadyNormalized ? prev : normalized;
    });
  }, [questions]);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user")) || {}; }
    catch { return {}; }
  })();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = getAuthHeaders();

        const [suiteRes, qRes, settingsRes] = await Promise.all([
          axios.get(`${API}/api/test-suites/${suiteId}`, { headers }),
          axios.get(`${API}/api/test-suites/${suiteId}/questions`, { headers }),
          axios.get(`${API}/api/settings`),
        ]);

        setSuite(suiteRes.data);
        setQuestions(qRes.data);

        const durationMins = settingsRes.data?.examDuration     || 30;
        const passing      = suiteRes.data?.passingPercentage ?? settingsRes.data?.passingPercentage ?? 50;
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
        if (prev <= 1) { clearInterval(timerRef.current); autoSubmit(); return 0; }
        if (prev === 61) setShowWarning(true);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timeLeft, submitted]);

  const autoSubmit = () => { setShowWarning(false); handleSubmitInternal(true); };

  const handleSelect = (questionId, optionIndex) => {
    if (submitted) return;
    setAnswers(prev => {
      return { ...prev, [questionId]: [optionIndex] };
    });
  };

  const handleTheoryAnswer = (questionId, value) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleMarkForReview = (idx) => {
    setMarkedForReview(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const jumpToQuestion = (idx) => {
    setCurrentQuestion(idx);
    document.getElementById(`question-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSubmitClick = () => {
    const unanswered = questions.filter(q => !isQuestionAnswered(q, answers)).length;
    if (unanswered > 0) {
      const firstIdx = questions.findIndex(q => !isQuestionAnswered(q, answers));
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
      const currentAnswers = isAuto ? answersRef.current : answers;

      let finalScore = 0, totalMarksCount = 0;
      questions.forEach(q => {
        if (isTheoryQuestion(q)) return;
        const marks = q.marks ?? 1;
        const selectedOption = getSingleSelectedOption(currentAnswers[q._id]);
        const selectedArr = selectedOption === null ? [] : [selectedOption];
        const { earnedFrac } = scoreQuestion(q, selectedArr);
        totalMarksCount += marks;
        finalScore      += earnedFrac * marks;
      });
      const pct    = totalMarksCount > 0 ? Math.round((finalScore / totalMarksCount) * 100) : 0;
      const passed = pct >= passingPct;

      const payload = {
        suiteId,
        testName:       suite?.name || "",
        CandidateName:  user.name,
        CandidateEmail: user.email,
        project:        user.project     || "General",
        designation:    user.designation || "",
        passed,
        answers: questions.map(q => ({
          questionId:      q._id,
          selectedOptions: isTheoryQuestion(q) ? [] : (() => {
            const selectedOption = getSingleSelectedOption(currentAnswers[q._id]);
            return selectedOption === null ? [] : [selectedOption];
          })(),
          textAnswer: isTheoryQuestion(q) ? String(currentAnswers[q._id] || "").trim() : "",
        })),
      };

      const res = await axios.post(`${API}/api/results`, payload, {
        headers: getAuthHeaders(),
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

  // Results Screen
  if (submitted && result) {
    const pct    = Math.round((result.score / result.totalMarks) * 100) || 0;
    const passed = pct >= passingPct;
    const catStats   = buildCategoryStats(questions, answers);
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
      <div style={{ minHeight:"100vh", background: BG, padding:"24px 16px" }}>
        <div style={{ maxWidth:"520px", margin:"0 auto" }}>
          <div style={{ background: WHITE, borderRadius:"20px", padding:"32px", textAlign:"center", boxShadow:"0 8px 32px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize:"48px" }}>{passed ? "🎉" : "📚"}</div>
            <h1 style={{ color: GREEN_DARK }}>{passed ? "Passed!" : "Try Again"}</h1>
            <div style={{ background: BG, borderRadius:"14px", padding:"20px", margin:"20px 0" }}>
              <p style={{ fontSize:"12px", color:"#888", textTransform:"uppercase" }}>Your Result</p>
              <p style={{ fontSize:"40px", fontWeight:"800", color: GREEN_DARK, margin:0 }}>{result.score} / {result.totalMarks}</p>
              <p style={{ fontSize:"24px", color: pctColor(pct), margin:0 }}>{pct}%</p>
            </div>

            {/* Category breakdown */}
            {catEntries.length > 0 && (
              <div style={{ marginBottom:"20px", textAlign:"left" }}>
                <p style={{ fontSize:"12px", color:"#888", textTransform:"uppercase", marginBottom:"10px", textAlign:"center" }}>Category Breakdown</p>
                {catEntries.map(([cat, s]) => {
                  const catPct = s.marks > 0 ? Math.round((s.earnedMarks / s.marks) * 100) : 0;
                  return (
                    <div key={cat} style={{ marginBottom:"10px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:"13px", marginBottom:"4px" }}>
                        <span style={{ fontWeight:"600", color: GREEN_DARK }}>{cat}</span>
                        <span style={{ color: pctColor(catPct), fontWeight:"700" }}>{catPct}% ({s.correct}/{s.total})</span>
                      </div>
                      <div style={{ height:"6px", background:"#eee", borderRadius:"99px" }}>
                        <div style={{ height:"6px", width:`${catPct}%`, background: pctColor(catPct), borderRadius:"99px", transition:"width 0.6s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {passed && (
              <button onClick={handleDownloadCertificate} style={{ width:"100%", padding:"12px", background: GREEN, color: WHITE, border:"none", borderRadius:"12px", cursor:"pointer", marginBottom:"12px" }}>
                🎓 Download Certificate
              </button>
            )}
            <button onClick={() => navigate("/candidate")} style={{ width:"100%", padding:"12px", background:"#f3f4f6", color:"#555", border:"none", borderRadius:"12px", cursor:"pointer" }}>
              Back to Tests
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Test Screen
  const answeredCount  = questions.filter(q => isQuestionAnswered(q, answers)).length;
  const isLowTime      = timeLeft !== null && timeLeft <= 60;
  const attemptedCount = answeredCount;
  const reviewCount    = markedForReview.length;
  const totalCount     = questions.length;

  return (
    <div style={{ minHeight:"100vh", background: BG, fontFamily:"'Segoe UI', sans-serif" }}>

      {/* Timer Warning */}
      {showWarning && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background: WHITE, padding:"30px", borderRadius:"20px", textAlign:"center" }}>
            <h2>⚠️ 1 Minute Left</h2>
            <p>Complete your answers quickly!</p>
            <button onClick={() => setShowWarning(false)} style={{ background: GREEN, color: WHITE, padding:"10px 20px", border:"none", borderRadius:"8px" }}>OK</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background: WHITE, padding:"32px", borderRadius:"24px", maxWidth:"400px", textAlign:"center" }}>
            <h3>Submit Assessment?</h3>
            <p>{answeredCount} of {questions.length} answered.</p>
            {markedForReview.length > 0 && <p style={{ color: ORANGE }}>⚠️ {markedForReview.length} items still marked for review.</p>}
            <div style={{ display:"flex", gap:"12px", marginTop:"20px" }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex:1, padding:"12px", borderRadius:"10px", border:"1px solid #ddd" }}>Review</button>
              <button onClick={() => handleSubmitInternal(false)} style={{ flex:1, padding:"12px", borderRadius:"10px", background: GREEN, color: WHITE, border:"none" }}>Submit Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: WHITE, padding:"16px 28px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
        <div>
          <h2 style={{ margin:0, fontSize:"18px", color: GREEN_DARK }}>{suite?.name}</h2>
          <span style={{ fontSize:"12px", color:"#888" }}>{answeredCount} / {questions.length} Answered</span>
        </div>
        <div style={{ background: isLowTime ? "#fee2e2" : "#f0faf5", padding:"8px 16px", borderRadius:"999px", color: isLowTime ? "#dc2626" : GREEN, fontWeight:"bold" }}>
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ maxWidth:"1100px", margin:"24px auto", padding:"0 16px 120px", display:"flex", gap:"24px", alignItems:"flex-start" }}>

        {/* Question Navigation Panel */}
        <div style={{ width:"220px", flexShrink:0, background: WHITE, borderRadius:"16px", padding:"20px", boxShadow:"0 4px 16px rgba(0,0,0,0.06)", position:"sticky", top:"80px" }}>
          <h3 style={{ margin:"0 0 16px", fontSize:"15px", fontWeight:"700", color: GREEN_DARK }}>Questions</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"8px", marginBottom:"20px" }}>
            {questions.map((q, idx) => {
              const isAnswered = isQuestionAnswered(q, answers);
              const isReview   = markedForReview.includes(idx);
              const isCurrent  = currentQuestion === idx;

              let bg = WHITE, color = "#555", border = "1.5px solid #ddd";
              if (isCurrent)       { bg = GREEN_DARK; color = WHITE; border = `1.5px solid ${GREEN_DARK}`; }
              else if (isReview)   { bg = ORANGE;     color = WHITE; border = `1.5px solid ${ORANGE}`; }
              else if (isAnswered) { bg = GREEN;      color = WHITE; border = `1.5px solid ${GREEN}`; }

              return (
                <button key={q._id} onClick={() => jumpToQuestion(idx)} style={{ width:"36px", height:"36px", borderRadius:"8px", background: bg, color, border, fontWeight:"600", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}>
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"8px", borderTop:"1px solid #eee", paddingTop:"16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"12px", color:"#555" }}>
              <span style={{ width:"16px", height:"16px", borderRadius:"4px", background: GREEN, display:"inline-block", flexShrink:0 }} />
              Attempted ({attemptedCount})
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"12px", color:"#555" }}>
              <span style={{ width:"16px", height:"16px", borderRadius:"4px", background: ORANGE, display:"inline-block", flexShrink:0 }} />
              Marked for Review ({reviewCount})
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"12px", color:"#555" }}>
              <span style={{ width:"16px", height:"16px", borderRadius:"4px", background: WHITE, border:"1.5px solid #ddd", display:"inline-block", flexShrink:0 }} />
              Not Attempted ({Math.max(0, totalCount - attemptedCount)})
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"12px", color:"#555" }}>
              <span style={{ width:"16px", height:"16px", borderRadius:"4px", background: GREEN_DARK, display:"inline-block", flexShrink:0 }} />
              Current
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div style={{ flex:1 }}>
          {questions.map((q, idx) => {
            const isMarked   = markedForReview.includes(idx);
            const isSelected = isQuestionAnswered(q, answers);
            const qCats      = getQuestionCats(q);
            const theory     = isTheoryQuestion(q);

            return (
              <div
                id={`question-${idx}`}
                key={q._id}
                onClick={() => setCurrentQuestion(idx)}
                style={{ background: WHITE, borderRadius:"16px", padding:"24px", marginBottom:"16px", border:`2px solid ${isMarked ? ORANGE : isSelected ? "#c6e2d0" : "transparent"}`, cursor:"default" }}
              >
                {/* Progress bar */}
                <div style={{ marginBottom:"12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"#aaa", marginBottom:"4px" }}>
                    <span>QUESTION {idx + 1} OF {questions.length}</span>
                    <span>{Math.round(((idx + 1) / questions.length) * 100)}% COMPLETE</span>
                  </div>
                  <div style={{ height:"4px", background:"#eee", borderRadius:"99px" }}>
                    <div style={{ height:"4px", width:`${((idx + 1) / questions.length) * 100}%`, background: GREEN, borderRadius:"99px" }} />
                  </div>
                </div>

                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"12px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
                    <span style={{ fontWeight:"bold", color:"#aaa" }}>Q{idx + 1}</span>
                    {/* Category tags */}
                    {qCats.map(cat => (
                      <span key={cat} style={{ background:"#f0faf5", color: GREEN_DARK, padding:"2px 10px", borderRadius:"999px", fontSize:"11px", fontWeight:"600", border:`1px solid #c6e2d0` }}>
                        {cat}
                      </span>
                    ))}
                    <span style={{ background: theory ? "#dbeafe" : "#dcfce7", color: theory ? "#1d4ed8" : "#166534", padding:"2px 10px", borderRadius:"999px", fontSize:"11px", fontWeight:"700", border:`1px solid ${theory ? "#bfdbfe" : "#bbf7d0"}` }}>
                      {theory ? "Theory" : "MCQ"}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMarkForReview(idx); }}
                    style={{ background:"none", border:"none", cursor:"pointer", color: isMarked ? ORANGE : "#ccc", fontSize:"13px", whiteSpace:"nowrap" }}
                  >
                    {isMarked ? "★ Marked for Review" : "☆ Mark for Review"}
                  </button>
                </div>

                <p style={{ fontSize:"16px", fontWeight:"600", marginBottom:"16px" }}>{q.questionText}</p>

                {theory ? (
                  <textarea
                    rows={5}
                    value={typeof answers[q._id] === "string" ? answers[q._id] : ""}
                    onChange={(e) => handleTheoryAnswer(q._id, e.target.value)}
                    placeholder="Write your answer here..."
                    style={{
                      width: "100%",
                      border: `1px solid ${isSelected ? GREEN : "#ddd"}`,
                      borderRadius: "10px",
                      padding: "12px",
                      fontSize: "14px",
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "inherit",
                      background: isSelected ? "#f0faf5" : "#f9fafb",
                    }}
                  />
                ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  {q.options.map((opt, oIdx) => {
                    const checked = getSingleSelectedOption(answers[q._id]) === oIdx;
                    return (
                      <label key={oIdx} style={{ display:"flex", alignItems:"center", padding:"12px", borderRadius:"10px", background: checked ? "#f0faf5" : "#f9fafb", cursor:"pointer", border: checked ? `1px solid ${GREEN}` : "1px solid #eee", transition:"all 0.15s" }}>
                        <input
                          type="radio"
                          name={`question-${q._id}`}
                          checked={checked}
                          onChange={() => handleSelect(q._id, oIdx)}
                          style={{ marginRight:"12px", accentColor: GREEN }}
                        />
                        {opt}
                      </label>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Submit Footer */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background: WHITE, padding:"20px", textAlign:"center", borderTop:"1px solid #eee" }}>
        <button onClick={handleSubmitClick} disabled={submitting} style={{ padding:"14px 60px", background: GREEN, color: WHITE, border:"none", borderRadius:"999px", fontSize:"16px", fontWeight:"bold", cursor:"pointer" }}>
          {submitting ? "Submitting..." : "Finish & Submit"}
        </button>
      </div>
    </div>
  );
}
