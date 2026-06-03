import { useEffect, useState, useRef } from "react";
import axios from "axios";
import "../styles/quiz.css";

function Test() {

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null); // ✅ null = not loaded yet
  const timerStarted = useRef(false); // ✅ prevents multiple timers

  useEffect(() => {
    fetchQuestions();
    fetchSettings();
  }, []);

  // ✅ FIXED: Timer only starts ONCE when both questions and timeLeft are ready
  useEffect(() => {
    if (questions.length === 0 || timeLeft === null || timerStarted.current) return;

    timerStarted.current = true; // ✅ mark timer as started

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

  // ✅ FIXED: parseInt to ensure number not string
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
      const categoryMap = {};

      questions.forEach((q, index) => {
        const category = q.category || "General";

        if (!categoryMap[category]) {
          categoryMap[category] = {
            category: category,
            score: 0,
            total: 0,
          };
        }

        categoryMap[category].total += 1;

        if (answers[index] === q.correctAnswer) {
          finalScore++;
          categoryMap[category].score += 1;
        }
      });

      const categoryResults = Object.values(categoryMap).map((item) => ({
        category: item.category,
        score: item.score,
        total: item.total,
        percentage: Math.round((item.score / item.total) * 100),
      }));

      const user = JSON.parse(localStorage.getItem("user")) || {};

      await axios.post(
        "https://mcqtestportal-production.up.railway.app/api/results/add",
        {
          userName: user.name || "Candidate",
          userEmail: user.email || "No Email",
          score: finalScore,
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

  // ✅ Show loading until settings are fetched
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