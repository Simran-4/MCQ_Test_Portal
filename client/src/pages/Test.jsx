import { useEffect, useState } from "react";
import axios from "axios";
import "../styles/quiz.css";

function Test() {

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  // FETCH QUESTIONS + SETTINGS
  useEffect(() => {

    fetchQuestions();
    fetchSettings();

  }, []);

  // TIMER
  useEffect(() => {

    if (questions.length === 0) return;

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

  }, [questions]);

  // FETCH SETTINGS
  const fetchSettings = async () => {

    try {

      const res = await axios.get(
        "https://mcqtestportal-production.up.railway.app/api/settings"
      );

      if (res.data.examTime) {

        setTimeLeft(res.data.totalTime * 60);
      }

    } catch (err) {

      console.log(err);
    }
  };

  // FETCH QUESTIONS
  const fetchQuestions = async () => {

    try {

      const res = await axios.get(
        "https://mcqtestportal-production.up.railway.app/api/questions/all"
      );

      // KEEP ORIGINAL ORDER
      const fetchedQuestions = res.data;

      setQuestions(fetchedQuestions);

      setAnswers(
        new Array(fetchedQuestions.length).fill("")
      );

    } catch (err) {

      console.log(err);
    }
  };

  // SELECT ANSWER
  const handleSelect = (answer) => {

    const updatedAnswers = [...answers];

    updatedAnswers[currentQuestion] = answer;

    setAnswers(updatedAnswers);
  };

  // SUBMIT TEST
  const handleSubmit = async () => {

    try {

      let finalScore = 0;

      const categoryMap = {};

      questions.forEach((q, index) => {

        const category =
          q.category || "General";

        // CREATE CATEGORY
        if (!categoryMap[category]) {

          categoryMap[category] = {

            category: category,
            score: 0,
            total: 0,
          };
        }

        // TOTAL QUESTIONS
        categoryMap[category].total += 1;

        // CORRECT ANSWER CHECK
        if (
          answers[index] === q.correctAnswer
        ) {

          finalScore++;

          categoryMap[category].score += 1;
        }
      });

      // CONVERT TO ARRAY
      const categoryResults =
        Object.values(categoryMap).map((item) => ({

          category: item.category,

          score: item.score,

          total: item.total,

          percentage: Math.round(
            (item.score / item.total) * 100
          ),
        }));

      // GET USER
      const user =
        JSON.parse(
          localStorage.getItem("user")
        ) || {};

      // SAVE RESULT
      await axios.post(
        "https://mcqtestportal-production.up.railway.app/api/results/add",
        {

          userName:
            user.name || "Student",

          userEmail:
            user.email || "No Email",

          score: finalScore,

          totalQuestions:
            questions.length,

          categoryResults,
        }
      );

      // GO TO RESULT PAGE
      window.location.href =
        "/view-results";

    } catch (err) {

      console.log(err);

      alert("Error Submitting Test");
    }
  };

  // TIMER FORMAT
  const minutes =
    Math.floor(timeLeft / 60);

  const seconds =
    timeLeft % 60;

  return (

    <div className="quiz-page">

      <img
        src="/Logo.png"
        alt="logo"
        className="corner-logo"
      />

      <div className="quiz-container">

        {/* LEFT QUESTION PANEL */}
        <div className="question-tray-card">

          <h4>Questions</h4>

          <div id="question-tray">

            {questions.map((q, index) => {

              let btnClass =
                "question-number";

              // ANSWERED = GREEN
              if (answers[index]) {

                btnClass += " answered";
              }

              // CURRENT = BLACK
              if (
                currentQuestion === index
              ) {

                btnClass += " active";
              }

              return (

                <button
                  key={index}
                  className={btnClass}
                  onClick={() =>
                    setCurrentQuestion(index)
                  }
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

              QUESTION {currentQuestion + 1}
              {" "}OF{" "}
              {questions.length}

            </p>

            <div className="timer">

              {minutes}:
              {seconds
                .toString()
                .padStart(2, "0")}

            </div>

          </div>

          {/* PROGRESS BAR */}
          <div className="progress-bar">

            <div
              className="progress-fill"
              style={{

                width:
                  `${(
                    ((currentQuestion + 1) /
                      questions.length) *
                    100
                  )}%`,
              }}
            ></div>

          </div>

          {/* QUESTION */}
          {questions.length > 0 && (

            <>

              <h2 className="question-text">

                {
                  questions[currentQuestion]
                    ?.question
                }

              </h2>

              {/* OPTIONS */}
              <div className="options">

                {questions[
                  currentQuestion
                ]?.options.map(
                  (option, index) => (

                    <button
                      key={index}
                      className={`option-btn ${
                        answers[currentQuestion] === option
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        handleSelect(option)
                      }
                    >
                      {option}
                    </button>
                  )
                )}

              </div>

            </>
          )}

          {/* BUTTONS */}
          <div className="quiz-buttons">

            <button
              className="prev-btn"
              disabled={currentQuestion === 0}
              onClick={() =>
                setCurrentQuestion(
                  currentQuestion - 1
                )
              }
            >
              ← Previous
            </button>

            {currentQuestion ===
            questions.length - 1 ? (

              <button
                className="next-btn"
                onClick={handleSubmit}
              >
                Submit Test
              </button>

            ) : (

              <button
                className="next-btn"
                onClick={() =>
                  setCurrentQuestion(
                    currentQuestion + 1
                  )
                }
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