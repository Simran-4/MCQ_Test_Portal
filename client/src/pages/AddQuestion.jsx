import { useState, useEffect } from "react";
import axios from "axios";
import "./dashboard.css";
import { getAuthHeaders } from "../utils/auth";

const API = "https://charismatic-happiness-production-dc36.up.railway.app";

function AddQuestion() {
  const [question, setQuestion]       = useState("");
  const [options, setOptions]         = useState(["", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [category, setCategory]       = useState("");
  const [testSuiteId, setTestSuiteId] = useState("");
  const [suites, setSuites]           = useState([]);

  // Load test suites on mount
  useEffect(() => {
    axios.get(`${API}/api/test-suites`, { headers: getAuthHeaders() })
      .then(res => setSuites(res.data))
      .catch(err => console.log("Error loading suites", err));
  }, []);

  const handleOptionChange = (index, value) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const addOption = () => {
    if (options.length >= 6) return alert("Maximum 6 options allowed");
    setOptions([...options, ""]);
  };

  const removeOption = (index) => {
    if (options.length <= 2) return alert("Minimum 2 options required");
    const updated = options.filter((_, i) => i !== index);
    setOptions(updated);
    if (correctAnswer === options[index]) setCorrectAnswer("");
  };

  const handleAddQuestion = async () => {
    if (!testSuiteId)          return alert("Please select a test suite");
    if (!question.trim())      return alert("Please enter a question");

    const filledOptions = options.filter(o => o.trim() !== "");
    if (filledOptions.length < 2)              return alert("Please enter at least 2 options");
    if (!correctAnswer.trim())                 return alert("Please select the correct answer");
    if (!filledOptions.includes(correctAnswer)) return alert("Correct answer must match one of the options");

    try {
      await axios.post(
        `${API}/api/questions/add`,
        {
          question: question.trim(),
          options:  filledOptions,
          correctAnswer: correctAnswer.trim(),
          category: category ? [category] : [],
          testSuiteId,
        },
        { headers: getAuthHeaders() }
      );

      alert("Question Added Successfully");
      setQuestion("");
      setOptions(["", "", ""]);
      setCorrectAnswer("");
      setCategory("");

    } catch (err) {
      console.log(err);
      alert("Error Adding Question");
    }
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-card">

        <div className="dashboard-top">
          <div>
            <h1>Add Question</h1>
            <p>Create questions for the test portal</p>
          </div>
          <img src="/Logo.png" alt="logo" className="dashboard-logo" />
        </div>

        <div className="dashboard-line"></div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* TEST SUITE */}
          <select
            value={testSuiteId}
            onChange={(e) => setTestSuiteId(e.target.value)}
            className="modern-input"
          >
            <option value="">Select Test Suite</option>
            {suites.map(suite => (
              <option key={suite._id} value={suite._id}>
                {suite.name} ({suite.questionCount} questions)
              </option>
            ))}
          </select>

          {/* QUESTION */}
          <input
            type="text"
            placeholder="Enter Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="modern-input"
          />

          {/* OPTIONS */}
          <div>
            <p style={{
              fontSize: "13px", color: "#2d5d50", fontWeight: "700",
              marginBottom: "12px", letterSpacing: "0.05em", textTransform: "uppercase"
            }}>
              Options ({options.length})
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {options.map((option, index) => (
                <div key={index} style={{ display: "flex", gap: "10px", alignItems: "center" }}>

                  <div style={{
                    width: "32px", height: "32px", borderRadius: "50%",
                    background: correctAnswer === option && option !== ""
                      ? "linear-gradient(135deg, #1f4037, #2c7744)" : "#e8f0ec",
                    color: correctAnswer === option && option !== "" ? "white" : "#2d5d50",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: "700", fontSize: "13px", flexShrink: 0, transition: "all 0.3s",
                  }}>
                    {index + 1}
                  </div>

                  <input
                    type="text"
                    placeholder={`Option ${index + 1}${index < 2 ? " *" : " (optional)"}`}
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    className="modern-input"
                    style={{
                      flex: 1, margin: 0,
                      border: correctAnswer === option && option !== ""
                        ? "2px solid #2c7744" : "2px solid #e0e0e0",
                      transition: "border 0.3s",
                    }}
                  />

                  <button
                    onClick={() => setCorrectAnswer(option)}
                    disabled={!option.trim()}
                    title="Set as correct answer"
                    style={{
                      width: "36px", height: "36px", borderRadius: "50%", border: "none",
                      background: correctAnswer === option && option !== ""
                        ? "linear-gradient(135deg, #1f4037, #2c7744)" : "#f0f0f0",
                      color: correctAnswer === option && option !== "" ? "white" : "#999",
                      cursor: option.trim() ? "pointer" : "not-allowed",
                      fontSize: "16px", display: "flex", alignItems: "center",
                      justifyContent: "center", flexShrink: 0, transition: "all 0.3s",
                    }}
                  >✓</button>

                  <button
                    onClick={() => removeOption(index)}
                    title="Remove option"
                    style={{
                      width: "36px", height: "36px", borderRadius: "50%", border: "none",
                      background: "#fff0f0", color: "#e53e3e", cursor: "pointer",
                      fontSize: "18px", display: "flex", alignItems: "center",
                      justifyContent: "center", flexShrink: 0, transition: "all 0.3s",
                    }}
                  >×</button>

                </div>
              ))}
            </div>

            <button
              onClick={addOption}
              style={{
                marginTop: "14px", padding: "10px 20px",
                border: "2px dashed #2c7744", borderRadius: "12px",
                background: "transparent", color: "#2c7744",
                fontSize: "14px", fontWeight: "700", cursor: "pointer",
                width: "100%", transition: "all 0.3s",
              }}
              onMouseOver={e => e.target.style.background = "#f0faf5"}
              onMouseOut={e => e.target.style.background = "transparent"}
            >+ Add Option</button>
          </div>

          {/* CORRECT ANSWER DISPLAY */}
          {correctAnswer && (
            <div style={{
              padding: "12px 18px", background: "#f0faf5",
              border: "2px solid #2c7744", borderRadius: "12px",
              color: "#1f4037", fontSize: "14px", fontWeight: "700",
            }}>
              ✓ Correct Answer: <span style={{ color: "#2c7744" }}>{correctAnswer}</span>
            </div>
          )}

          {/* CATEGORY */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="modern-input"
          >
            <option value="">Select Category</option>
            <option value="Confidence">Confidence</option>
            <option value="Sociability">Sociability</option>
            <option value="Neurotic Tendency">Neurotic Tendency</option>
            <option value="Self Sufficiency">Self Sufficiency</option>
          </select>

          <button onClick={handleAddQuestion} className="dashboard-btn">
            Add Question
          </button>

        </div>
      </div>
    </div>
  );
}

export default AddQuestion;
