import { useCallback, useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import "../styles/quiz.css";
import { getAuthHeaders, getCurrentUser } from "../utils/auth";

const API = import.meta.env.VITE_API_URL || "";

function isQuestionImage(value) {
  const source = String(value || "").trim();
  return source.startsWith("data:image/") || /^https?:\/\/.+/i.test(source);
}

function isQuestionVideo(value) {
  const source = String(value || "").trim();
  return source.startsWith("data:video/") || /^https?:\/\/.+\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(source);
}

function Test() {

  const { suiteId } = useParams(); // for multi-suite support

  const [questions, setQuestions]             = useState([]);
  const [answers, setAnswers]                 = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft]               = useState(null);
  const timerStarted                          = useRef(false);
  const submitRef                             = useRef(() => {});

  // Feature 7: Mark for Review
  const [markedForReview, setMarkedForReview] = useState([]);

  // Feature 6: Confirmation dialog
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/settings`);
      if (res.data && res.data.examDuration) {
        setTimeLeft(parseInt(res.data.examDuration) * 60);
      }
    } catch (err) {
      console.log(err);
    }
  }, []);

  const fetchQuestions = useCallback(async () => {
    try {
      // Use suiteId-specific random endpoint if available, else fallback to /all
      const url = suiteId
        ? `${API}/api/questions/${suiteId}/random`
        : `${API}/api/questions/all`;

      const res = await axios.get(url, { headers: getAuthHeaders() });
      const fetchedQuestions = res.data;
      setQuestions(fetchedQuestions);
      setAnswers(new Array(fetchedQuestions.length).fill(null));
    } catch (err) {
      console.log(err);
    }
  }, [suiteId]);

  useEffect(() => {
    fetchQuestions();
    fetchSettings();
  }, [fetchQuestions, fetchSettings]);

  // Timer
  useEffect(() => {
    if (questions.length === 0 || timeLeft === null || timerStarted.current) return;

    timerStarted.current = true;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          submitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [questions, timeLeft]);

  const handleSelect = (answerIndex) => {
    const updatedAnswers = [...answers];
    updatedAnswers[currentQuestion] = answerIndex;
    setAnswers(updatedAnswers);
  };

  // Feature 7: Toggle mark for review
  const handleMarkForReview = () => {
    setMarkedForReview((prev) =>
      prev.includes(currentQuestion)
        ? prev.filter((i) => i !== currentQuestion)
        : [...prev, currentQuestion]
    );
  };

  // Feature 3 + 6: Block submit if unanswered, then show confirm dialog
  const handleSubmitClick = () => {
    const unanswered = answers.filter((a) => a === null || a === undefined).length;
    if (unanswered > 0) {
      const firstUnanswered = answers.findIndex((a) => a === null || a === undefined);
      setCurrentQuestion(firstUnanswered);
      alert(
        `Please answer all questions before submitting.\n\n${unanswered} question(s) still unanswered.\n\nJumping to Question ${firstUnanswered + 1}.`
      );
      return;
    }
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    setShowConfirm(false);
    try {
      let finalScore      = 0;
      let totalMarksCount = 0;
      const categoryMap   = {};

      questions.forEach((q, index) => {
        const rawCategory = q.category;
        const categoryKey = Array.isArray(rawCategory)
          ? rawCategory.join(",")
          : rawCategory || "General";

        const questionMarks = q.marks ?? q.totalMarks ?? 1;

        if (!categoryMap[categoryKey]) {
          categoryMap[categoryKey] = {
            category:    categoryKey,
            score:       0,
            total:       0,
            earnedMarks: 0,
            totalMarks:  0,
          };
        }

        categoryMap[categoryKey].total      += 1;
        categoryMap[categoryKey].totalMarks += questionMarks;
        totalMarksCount                     += questionMarks;

        const selectedIndex = answers[index];
        const correctIndexes = Array.isArray(q.correctAnswer)
          ? q.correctAnswer.map(Number)
          : [Number(q.correctAnswer)];
        const isCorrect = correctIndexes.includes(Number(selectedIndex));
        if (isCorrect) {
          finalScore += questionMarks;
          categoryMap[categoryKey].score       += 1;
          categoryMap[categoryKey].earnedMarks += questionMarks;
        }
      });

      const categoryResults = Object.values(categoryMap).map((item) => ({
        category:   item.category,
        score:      item.score,
        total:      item.total,
        earnedMarks: item.earnedMarks,
        totalMarks:  item.totalMarks,
        percentage:  item.totalMarks > 0
          ? Math.round((item.earnedMarks / item.totalMarks) * 100)
          : 0,
      }));

      // Feature 8: Compute passed flag from settings
      let passed = false;
      try {
        const settingsRes = await axios.get(`${API}/api/settings`);
        const passingPct  = settingsRes.data?.passingPercentage ?? 50;
        const pct         = totalMarksCount > 0
          ? Math.round((finalScore / totalMarksCount) * 100)
          : 0;
        passed = pct >= passingPct;
      } catch {
        // if settings fetch fails, default passed = false
      }

      const user = getCurrentUser();

      await axios.post(
        `${API}/api/results/add`,
        {
          userName:       user.name        || "Candidate",
          userEmail:      user.email || user.mobile || user.username || "No Contact",
          project:        user.project     || "General",
          designation:    user.designation || "",
          score:          finalScore,
          totalMarks:     totalMarksCount,
          totalQuestions: questions.length,
          categoryResults,
          passed,
        },
        { headers: getAuthHeaders() }
      );

      window.location.href = "/view-results";

    } catch (err) {
      console.log(err);
      alert("Error Submitting Test");
    }
  };

  useEffect(() => {
    submitRef.current = handleSubmit;
  });

  // Loading state
  if (timeLeft === null) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f1eb",
        fontSize: "20px",
        color: "#2d5d50",
      }}>
        Loading exam...
      </div>
    );
  }

  const minutes       = Math.floor(timeLeft / 60);
  const seconds       = timeLeft % 60;
  const answeredCount  = answers.filter((a) => a !== null && a !== undefined).length;
  const unansweredCount = questions.length - answeredCount;
  const isMarked       = markedForReview.includes(currentQuestion);

  // Timer colour: red when under 60 seconds
  const timerColor = timeLeft <= 60 ? "#dc2626" : "#1A3D28";

  return (
    <div className="quiz-page">

      <img src="/Logo.png" alt="logo" className="corner-logo" />

      <div className="quiz-container">

        {/* ── LEFT: QUESTION TRAY ─────────────────────────── */}
        <div className="question-tray-card">
          <h4>Questions</h4>

          {/* Legend */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px", fontSize: "11px", color: "#888" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{ width: "14px", height: "14px", borderRadius: "4px", background: "#22c55e", display: "inline-block" }} />
              Answered ({answeredCount})
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{ width: "14px", height: "14px", borderRadius: "4px", background: "#f97316", display: "inline-block" }} />
              Marked for Review ({markedForReview.length})
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{ width: "14px", height: "14px", borderRadius: "4px", background: "#e5e7eb", border: "1px solid #ccc", display: "inline-block" }} />
              Unanswered ({unansweredCount})
            </div>
          </div>

          {/* Question number buttons */}
          <div id="question-tray">
            {questions.map((q, index) => {
              let btnClass = "question-number";
              if (markedForReview.includes(index))  btnClass += " reviewed";
              else if (answers[index])              btnClass += " answered";
              if (currentQuestion === index)        btnClass += " active";
              return (
                <button
                  key={index}
                  className={btnClass}
                  onClick={() => setCurrentQuestion(index)}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: QUIZ SECTION ─────────────────────────── */}
        <div className="card card--quiz">

          <div className="quiz-top">
            <p className="question-count">
              QUESTION {currentQuestion + 1} OF {questions.length}
            </p>
            <div className="timer" style={{ color: timerColor, fontWeight: timeLeft <= 60 ? "800" : undefined }}>
              {minutes}:{seconds.toString().padStart(2, "0")}
            </div>
          </div>

          {/* Progress bar */}
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
            />
          </div>

          {/* Question + options */}
          {questions.length > 0 && (
            <>
              <h2 className="question-text">
                {questions[currentQuestion]?.questionText || questions[currentQuestion]?.question}
              </h2>
              {isQuestionImage(questions[currentQuestion]?.imageUrl) && (
                <img
                  className="question-image"
                  src={questions[currentQuestion].imageUrl}
                  alt={`Question ${currentQuestion + 1}`}
                />
              )}
              {isQuestionVideo(questions[currentQuestion]?.videoUrl) && (
                <video
                  className="question-image"
                  src={questions[currentQuestion].videoUrl}
                  controls
                  playsInline
                />
              )}

              <div className="options">
                {questions[currentQuestion]?.options.map((option, index) => (
                  <button
                    key={index}
                    className={`option-btn ${answers[currentQuestion] === index ? "selected" : ""}`}
                    onClick={() => handleSelect(index)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Buttons row */}
          <div className="quiz-buttons">

            <button
              className="prev-btn"
              disabled={currentQuestion === 0}
              onClick={() => setCurrentQuestion(currentQuestion - 1)}
            >
              ← Previous
            </button>

            {/* Feature 7: Mark for Review */}
            <button
              className={`review-btn${isMarked ? " review-btn--active" : ""}`}
              onClick={handleMarkForReview}
              style={{
                padding: "10px 18px",
                borderRadius: "10px",
                border: `2px solid ${isMarked ? "#f97316" : "#d1d5db"}`,
                background: isMarked ? "#fff7ed" : "#f9fafb",
                color: isMarked ? "#ea580c" : "#6b7280",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {isMarked ? "🟠 Marked" : "⚑ Mark for Review"}
            </button>

            {/* Feature 3 + 6: Submit or Next */}
            {currentQuestion === questions.length - 1 ? (
              <button className="next-btn" onClick={handleSubmitClick}>
                Submit Test
              </button>
            ) : (
              <button
                className="next-btn"
                onClick={() => setCurrentQuestion(currentQuestion + 1)}
              >
                Next →
              </button>
            )}

          </div>

          {/* Unanswered warning — shown on last question */}
          {currentQuestion === questions.length - 1 && unansweredCount > 0 && (
            <div style={{
              marginTop: "14px",
              padding: "10px 16px",
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: "10px",
              fontSize: "13px",
              color: "#92400e",
              fontWeight: "600",
            }}>
              ⚠️ {unansweredCount} question{unansweredCount > 1 ? "s" : ""} still unanswered. All questions are compulsory.
            </div>
          )}

        </div>
      </div>

      {/* ── Feature 6: Confirmation Modal ───────────────────── */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 999,
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "24px",
            padding: "40px 36px",
            maxWidth: "420px",
            width: "90%",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📋</div>
            <h2 style={{ fontSize: "22px", fontWeight: "800", color: "#1A3D28", marginBottom: "8px" }}>
              Submit Test?
            </h2>
            <p style={{ color: "#666", fontSize: "14px", marginBottom: "20px" }}>
              Please review your summary before submitting.
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
              <div style={{ background: "#f0faf5", borderRadius: "12px", padding: "12px 20px", minWidth: "100px" }}>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#1A3D28" }}>{answeredCount}</div>
                <div style={{ fontSize: "12px", color: "#888" }}>Answered</div>
              </div>
              <div style={{ background: markedForReview.length > 0 ? "#fff7ed" : "#f9fafb", borderRadius: "12px", padding: "12px 20px", minWidth: "100px" }}>
                <div style={{ fontSize: "24px", fontWeight: "800", color: markedForReview.length > 0 ? "#ea580c" : "#aaa" }}>
                  {markedForReview.length}
                </div>
                <div style={{ fontSize: "12px", color: "#888" }}>Marked for Review</div>
              </div>
              <div style={{ background: "#f9fafb", borderRadius: "12px", padding: "12px 20px", minWidth: "100px" }}>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#aaa" }}>{questions.length}</div>
                <div style={{ fontSize: "12px", color: "#888" }}>Total Questions</div>
              </div>
            </div>

            {markedForReview.length > 0 && (
              <div style={{
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: "10px",
                padding: "10px 14px",
                marginBottom: "20px",
                fontSize: "13px",
                color: "#92400e",
              }}>
                ⚠️ You have {markedForReview.length} question{markedForReview.length > 1 ? "s" : ""} marked for review. Are you sure you want to submit?
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: "12px 28px", borderRadius: "12px",
                  border: "1.5px solid #ddd", background: "#fff",
                  color: "#555", fontWeight: "700", fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                style={{
                  padding: "12px 28px", borderRadius: "12px",
                  border: "none", background: "#2D5F3F",
                  color: "#fff", fontWeight: "700", fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Yes, Submit →
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Test;
