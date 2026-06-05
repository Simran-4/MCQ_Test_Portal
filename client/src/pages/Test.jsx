import { useEffect, useState, useRef } from "react";
import axios from "axios";
import "../styles/quiz.css";

function Test() {

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const timerStarted = useRef(false);

  useEffect(() => {
    fetchQuestions();
    fetchSettings();
  }, []);

  useEffect(() => {
    if (questions.length === 0 || timeLeft === null || timerStarted.current) return;

    timerStarted.current = true;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [questions, timeLeft]);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(
        "https://mcqtestportal-production.up.railway.app/api/settings"
      );
      if (res.data && res.data.examDuration) {
        setTimeLeft(parseInt(res.data.examDuration) * 60);
      }
    } catch (err) {
      console.log(err);
    }
  };

  const fetchQuestions = async () => {
    try {
      const res = await axios.get(
        "https://mcqtestportal-production.up.railway.app/api/questions/all"
      );
      const fetchedQuestions = res.data;
      setQuestions(fetchedQuestions);
      setAnswers(new Array(fetchedQuestions.length).fill(""));
    } catch (err) {
      console.log(err);
    }
  };

  const handleSelect = (answer) => {
    const updatedAnswers = [...answers];
    updatedAnswers[currentQuestion] = answer;
    setAnswers(updatedAnswers);
  };

  const handleSubmit = async () => {
    try {
      let finalScore = 0;
      let totalMarksCount = 0;
      const categoryMap = {};

      questions.forEach((q, index) => {
        // ✅ Support both single-category string and multi-category array
        const rawCategory = q.category;
        const categoryKey = Array.isArray(rawCategory)
          ? rawCategory.join(",")
          : rawCategory || "General";

        const questionMarks = q.marks ?? q.totalMarks ?? 1; // ✅ use question's marks, default 1

        if (!categoryMap[categoryKey]) {
          categoryMap[categoryKey] = {
            category: categoryKey,
            score: 0,       // correct count
            total: 0,       // total questions in category
            earnedMarks: 0, // ✅ marks actually earned
            totalMarks: 0,  // ✅ total marks available in category
          };
        }

        categoryMap[categoryKey].total      += 1;
        categoryMap[categoryKey].totalMarks += questionMarks;
        totalMarksCount                     += questionMarks;

        const isCorrect = answers[index] === q.correctAnswer;
        if (isCorrect) {
          finalScore++;
          categoryMap[categoryKey].score       += 1;
          categoryMap[categoryKey].earnedMarks += questionMarks; // ✅ add earned marks
        }
      });

      // ✅ Build categoryResults with all fields ViewResults.jsx needs
      const categoryResults = Object.values(categoryMap).map((item) => ({
        category:    item.category,
        score:       item.score,
        total:       item.total,
        earnedMarks: item.earnedMarks,  // ✅ NEW
        totalMarks:  item.totalMarks,   // ✅ NEW (used as "total" field in schema)
        percentage:  item.totalMarks > 0
          ? Math.round((item.earnedMarks / item.totalMarks) * 100)
          : 0,
      }));

      const user = JSON.parse(localStorage.getItem("user")) || {};

      await axios.post(
        "https://mcqtestportal-production.up.railway.app/api/results/add",
        {
          userName:       user.name  || "Candidate",
          userEmail:      user.email || "No Email",
          score:          finalScore,
          totalMarks:     totalMarksCount,  // ✅ send totalMarks not totalQuestions
          totalQuestions: questions.length,
          categoryResults,
        }
      );

      window.location.href = "/view-results";

    } catch (err) {
      console.log(err);
      alert("Error Submitting Test");
    }
  };

  if (timeLeft === null) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f1eb",
        fontSize: "20px",
        color: "#2d5d50"
      }}>
        Loading exam...
      </div>
    );
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="quiz-page">

      <img src="/Logo.png" alt="logo" className="corner-logo" />

      <div className="quiz-container">

        {/* LEFT QUESTION PANEL */}
        <div className="question-tray-card">
          <h4>Questions</h4>
          <div id="question-tray">
            {questions.map((q, index) => {
              let btnClass = "question-number";
              if (answers[index]) btnClass += " answered";
              if (currentQuestion === index) btnClass += " active";
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

        {/* RIGHT QUIZ SECTION */}
        <div className="card card--quiz">

          <div className="quiz-top">
            <p className="question-count">
              QUESTION {currentQuestion + 1} OF {questions.length}
            </p>
            <div className="timer">
              {minutes}:{seconds.toString().padStart(2, "0")}
            </div>
          </div>

          {/* PROGRESS BAR */}
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${((currentQuestion + 1) / questions.length) * 100}%`,
              }}
            ></div>
          </div>

          {/* QUESTION */}
          {questions.length > 0 && (
            <>
              <h2 className="question-text">
                {questions[currentQuestion]?.question}
              </h2>

              <div className="options">
                {questions[currentQuestion]?.options.map((option, index) => (
                  <button
                    key={index}
                    className={`option-btn ${
                      answers[currentQuestion] === option ? "selected" : ""
                    }`}
                    onClick={() => handleSelect(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* BUTTONS */}
          <div className="quiz-buttons">
            <button
              className="prev-btn"
              disabled={currentQuestion === 0}
              onClick={() => setCurrentQuestion(currentQuestion - 1)}
            >
              ← Previous
            </button>

            {currentQuestion === questions.length - 1 ? (
              <button className="next-btn" onClick={handleSubmit}>
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

        </div>
      </div>
    </div>
  );
}

export default Test;