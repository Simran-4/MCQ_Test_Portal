// src/pages/StudentTest.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { getAuthHeaders } from "../utils/auth";
import { downloadCertificatePDF } from "../utils/certificate";

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

function getReviewCorrectOptions(q) {
  if (isTheoryQuestion(q)) return [];
  const allCorrect = new Set(uniqueIndexes(Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]));
  const answerMap = getCategoryAnswerMap(q);
  Object.values(answerMap || {}).forEach(indexes => {
    uniqueIndexes(indexes).forEach(index => allCorrect.add(index));
  });
  return [...allCorrect].sort((a, b) => a - b);
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

function gradeInfo(pct) {
  if (pct >= 70) {
    return {
      label: "High",
      color: GREEN,
      bg: "#ecfdf3",
      message: "Excellent performance. Keep maintaining this level and continue building consistency.",
    };
  }
  if (pct >= 40) {
    return {
      label: "Moderate",
      color: "#f59e0b",
      bg: "#fff7ed",
      message: "You have a moderate level of accuracy. Keep practicing to improve your skills and aim for a high score.",
    };
  }
  return {
    label: "Low",
    color: "#dc2626",
    bg: "#fef2f2",
    message: "More practice is recommended. Review the answers carefully and try again to improve your score.",
  };
}

function getResultSuiteId(result) {
  return String(result?.suiteId?._id || result?.suiteId || "");
}

function getResultPercentage(result) {
  return result?.totalMarks > 0 ? Math.round(((result.score || 0) / result.totalMarks) * 100) : 0;
}

function isPassedResult(result) {
  return typeof result?.passed === "boolean" ? result.passed : getResultPercentage(result) >= 50;
}

function getUserId(user) {
  return String(user?._id || user?.id || "");
}

function getAssignmentDateForUserId(suite, userId) {
  if (!userId) return null;
  const match = (suite?.assignedUsersMeta || []).find(entry =>
    String(entry?.user?._id || entry?.user || "") === userId
  );
  return match?.assignedAt ? new Date(match.assignedAt) : null;
}

function latestPassedResultForSuite(results, suiteId) {
  return (results || [])
    .filter(res => getResultSuiteId(res) === String(suiteId) && isPassedResult(res))
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0] || null;
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
  const [showReviewAnswers, setShowReviewAnswers] = useState(false);
  const [blockedResult, setBlockedResult] = useState(null);

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
  const userId = getUserId(user);
  const userSearch = user.email || user.mobile || user.username || user.name || "";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = getAuthHeaders();

        const [suiteRes, resultsRes] = await Promise.all([
          axios.get(`${API}/api/test-suites/${suiteId}`, { headers }),
          userSearch
            ? axios.get(`${API}/api/results/all`, { headers, params: { search: userSearch } })
            : Promise.resolve({ data: [] }),
        ]);

        setSuite(suiteRes.data);

        const durationMins = Number(suiteRes.data?.duration) || 30;
        const passing      = suiteRes.data?.passingPercentage ?? 50;
        setPassingPct(passing);

        const passedAttempt = latestPassedResultForSuite(resultsRes.data, suiteId);
        const assignmentDate = getAssignmentDateForUserId(suiteRes.data, userId);

        if (passedAttempt && (!assignmentDate || new Date(passedAttempt.submittedAt || 0) >= assignmentDate)) {
          setBlockedResult(passedAttempt);
          setQuestions([]);
          setTimeLeft(null);
          return;
        }

        const qRes = await axios.get(`${API}/api/questions/${suiteId}/random`, { headers });
        setQuestions(qRes.data);
        setTimeLeft(durationMins * 60);
      } catch (err) {
        console.error("Failed to load test:", err);
        setError("Could not load this test. Please go back and try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [suiteId, userId, userSearch]);

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
    if (submitted || blockedResult) return;
    setAnswers(prev => {
      return { ...prev, [questionId]: [optionIndex] };
    });
  };

  const handleTheoryAnswer = (questionId, value) => {
    if (submitted || blockedResult) return;
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
    if (blockedResult) return;
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
        CandidateEmail: user.email || user.mobile || user.username || "",
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
      alert(err.response?.data?.message || "Failed to submit. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "grid", placeItems: "center", color: GREEN_DARK, fontFamily: "'Segoe UI', sans-serif" }}>
        Loading test...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "grid", placeItems: "center", padding: "20px", fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ background: WHITE, borderRadius: "16px", padding: "28px", maxWidth: "420px", textAlign: "center" }}>
          <h2 style={{ color: GREEN_DARK }}>Unable to load test</h2>
          <p style={{ color: "#666" }}>{error}</p>
          <button onClick={() => navigate("/candidate")} style={{ padding: "10px 18px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", cursor: "pointer" }}>
            Back to Tests
          </button>
        </div>
      </div>
    );
  }

  if (blockedResult) {
    const blockedPct = getResultPercentage(blockedResult);
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "grid", placeItems: "center", padding: "20px", fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ background: WHITE, borderRadius: "18px", padding: "30px", maxWidth: "460px", width: "100%", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "42px", marginBottom: "8px" }}>✓</div>
          <h2 style={{ color: GREEN_DARK, margin: "0 0 8px" }}>You already attempted this test.</h2>
          <p style={{ color: "#666", margin: "0 0 18px", lineHeight: 1.5 }}>
            You passed this assessment earlier, so another attempt is not allowed.
          </p>
          <div style={{ background: "#eef8f1", border: "1px solid #c6e2d0", borderRadius: "12px", padding: "14px", marginBottom: "18px", color: GREEN_DARK, fontWeight: "800" }}>
            Score: {blockedResult.score || 0} / {blockedResult.totalMarks || 0} ({blockedPct}%)
          </div>
          <button onClick={() => navigate("/candidate")} style={{ width: "100%", padding: "12px 18px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "800" }}>
            Back to Tests
          </button>
        </div>
      </div>
    );
  }

  // Results Screen
  if (submitted && result) {
    const pct    = Math.round((result.score / result.totalMarks) * 100) || 0;
    const passed = pct >= passingPct;
    const overallGrade = gradeInfo(pct);
    const catStats   = buildCategoryStats(questions, answers);
    const catEntries = Object.entries(catStats);

    const handleDownloadCertificate = (language) => {
      downloadCertificatePDF({
        ...result,
        CandidateName: user.name,
        CandidateEmail: user.email || user.mobile || user.username || "",
        testName: suite?.name || "",
        project: user.project || "",
        designation: user.designation || "",
        submittedAt: new Date().toISOString(),
      }, suite, language);
    };

    return (
      <div style={{ minHeight:"100vh", background: BG, padding:"24px 16px" }}>
        <div style={{ maxWidth:"980px", margin:"0 auto" }}>
          <div style={{ background: WHITE, borderRadius:"20px", padding:"32px", boxShadow:"0 8px 32px rgba(0,0,0,0.08)" }}>
            <div style={{ display:"grid", gridTemplateColumns:"minmax(260px, 1fr) minmax(260px, 0.9fr)", gap:"22px", alignItems:"stretch" }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:"48px" }}>{passed ? "🎉" : "📚"}</div>
                <h1 style={{ color: GREEN_DARK }}>{passed ? "Passed!" : "Try Again"}</h1>
                <div style={{ margin:"-8px auto 18px", maxWidth:"420px" }}>
                  <p style={{ margin:"0 0 6px", color: overallGrade.color, fontSize:"18px", fontWeight:"900" }}>
                    Recommendation: {overallGrade.label}
                  </p>
                  <p style={{ margin:0, color: GREEN_DARK, fontSize:"14px", lineHeight:1.5 }}>
                    {overallGrade.message}
                  </p>
                </div>
                <div style={{ background: BG, borderRadius:"14px", padding:"20px", margin:"20px 0" }}>
                  <p style={{ fontSize:"12px", color:"#888", textTransform:"uppercase" }}>Your Result</p>
                  <p style={{ fontSize:"40px", fontWeight:"800", color: GREEN_DARK, margin:0 }}>{result.score} / {result.totalMarks}</p>
                  <p style={{ fontSize:"24px", color: pctColor(pct), margin:0 }}>{pct}%</p>
                </div>
              </div>

              <div style={{ background:"#f8faf8", border:"1px solid #e5eee8", borderRadius:"16px", padding:"18px", display:"flex", flexDirection:"column", justifyContent:"center", gap:"10px" }}>
                <button
                  type="button"
                  onClick={() => setShowReviewAnswers(prev => !prev)}
                  style={{ width:"100%", padding:"12px", background: showReviewAnswers ? GREEN_DARK : GREEN, color: WHITE, border:"none", borderRadius:"12px", cursor:"pointer", fontWeight:"800" }}
                >
                  {showReviewAnswers ? "Hide Review" : "Review Answers"}
                </button>

                {passed && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                    <button onClick={() => handleDownloadCertificate("english")} style={{ width:"100%", padding:"12px", background: GREEN, color: WHITE, border:"none", borderRadius:"12px", cursor:"pointer", fontWeight:"800" }}>
                      English Certificate
                    </button>
                    <button onClick={() => handleDownloadCertificate("marathi")} style={{ width:"100%", padding:"12px", background: WHITE, color: GREEN_DARK, border:`1px solid ${GREEN}`, borderRadius:"12px", cursor:"pointer", fontWeight:"800" }}>
                      Marathi Certificate
                    </button>
                  </div>
                )}

                <button onClick={() => navigate("/candidate")} style={{ width:"100%", padding:"12px", background:"#eef1ef", color:"#555", border:"none", borderRadius:"12px", cursor:"pointer", fontWeight:"700" }}>
                  Back to Tests
                </button>
              </div>
            </div>

            {/* Category breakdown */}
            {catEntries.length > 0 && (
              <div style={{ marginBottom:"20px", textAlign:"left" }}>
                <p style={{ fontSize:"12px", color:"#888", textTransform:"uppercase", marginBottom:"10px", textAlign:"center" }}>Category Breakdown</p>
                {catEntries.map(([cat, s]) => {
                  const catPct = s.marks > 0 ? Math.round((s.earnedMarks / s.marks) * 100) : 0;
                  const catGrade = gradeInfo(catPct);
                  return (
                    <div key={cat} style={{ marginBottom:"10px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:"13px", marginBottom:"4px" }}>
                        <span style={{ fontWeight:"600", color: GREEN_DARK }}>{cat}</span>
                        <span style={{ color: catGrade.color, fontWeight:"800" }}>
                          {catGrade.label} ({catPct}% {s.correct}/{s.total})
                        </span>
                      </div>
                      <div style={{ height:"6px", background:"#eee", borderRadius:"99px" }}>
                        <div style={{ height:"6px", width:`${catPct}%`, background: catGrade.color, borderRadius:"99px", transition:"width 0.6s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {showReviewAnswers && (
              <div style={{ marginTop:"22px", borderTop:"1px solid #edf0ed", paddingTop:"20px" }}>
                <h2 style={{ margin:"0 0 14px", color: GREEN_DARK, fontSize:"22px" }}>Answer Review</h2>
                <div style={{ display:"grid", gap:"14px", textAlign:"left" }}>
                  {questions.map((q, idx) => {
                    const theory = isTheoryQuestion(q);
                    const selectedOption = getSingleSelectedOption(answers[q._id]);
                    const correctOptions = getReviewCorrectOptions(q);
                    const selectedText = theory
                      ? String(answers[q._id] || "").trim() || "No answer"
                      : selectedOption === null ? "Not answered" : q.options[selectedOption] || `Option ${selectedOption + 1}`;

                    return (
                      <div key={q._id} style={{ border:"1px solid #e5eee8", borderRadius:"14px", padding:"16px", background:"#fff" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", gap:"12px", marginBottom:"10px", flexWrap:"wrap" }}>
                          <strong style={{ color: GREEN_DARK }}>Q{idx + 1}. {q.questionText}</strong>
                          <span style={{ background: theory ? "#dbeafe" : "#dcfce7", color: theory ? "#1d4ed8" : "#166534", padding:"3px 10px", borderRadius:"999px", fontSize:"12px", fontWeight:"800" }}>
                            {theory ? "Theory" : "MCQ"}
                          </span>
                        </div>

                        {theory ? (
                          <div style={{ display:"grid", gap:"8px" }}>
                            <div style={{ padding:"10px 12px", borderRadius:"10px", background:"#f8faf8", color:"#333" }}>
                              <strong>Your answer: </strong>{selectedText}
                            </div>
                            <div style={{ padding:"10px 12px", borderRadius:"10px", background:"#fff7ed", color:"#9a3412" }}>
                              Theory answers are reviewed manually by the admin.
                            </div>
                          </div>
                        ) : (
                          <div style={{ display:"grid", gap:"8px" }}>
                            {q.options.map((opt, optionIdx) => {
                              const isSelected = selectedOption === optionIdx;
                              const isCorrect = correctOptions.includes(optionIdx);
                              let background = "#f9fafb";
                              let border = "1px solid #e5e7eb";
                              let label = "";
                              if (isCorrect) {
                                background = "#ecfdf3";
                                border = "1px solid #22c55e";
                                label = "Correct";
                              }
                              if (isSelected && !isCorrect) {
                                background = "#fef2f2";
                                border = "1px solid #ef4444";
                                label = "Your answer";
                              }
                              if (isSelected && isCorrect) label = "Your answer • Correct";

                              return (
                                <div key={optionIdx} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"12px", padding:"10px 12px", borderRadius:"10px", background, border }}>
                                  <span>{opt}</span>
                                  {label && <span style={{ fontSize:"12px", fontWeight:"800", color: isCorrect ? "#166534" : "#b91c1c", whiteSpace:"nowrap" }}>{label}</span>}
                                </div>
                              );
                            })}
                            <div style={{ fontSize:"12px", color:"#6b7280", marginTop:"2px" }}>
                              Selected: {selectedText}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
        <div style={{ width:"220px", flexShrink:0, background: WHITE, borderRadius:"16px", padding:"20px", boxShadow:"0 4px 16px rgba(0,0,0,0.06)", position:"sticky", top:"80px", maxHeight:"calc(100vh - 160px)", overflowY:"auto" }}>
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
