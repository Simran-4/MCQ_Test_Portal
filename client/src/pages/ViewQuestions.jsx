import { useEffect, useState } from "react";
import axios from "axios";

function ViewQuestions() {

  const [questions, setQuestions] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await axios.get(
        "https://mcq-backend-zeta.vercel.app/api/questions/all"
      );
      setQuestions(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await axios.delete(
        `https://mcq-backend-zeta.vercel.app/api/questions/${id}`
      );
      setQuestions(questions.filter(q => q._id !== id));
    } catch (err) {
      alert("Error deleting question");
    }
  };

  // ✅ Get unique categories
  const categories = ["All", ...new Set(questions.map(q => q.category).filter(Boolean))];

  // ✅ Filter by search + category
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.question.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "All" || q.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryColors = {
    "Confidence":       { bg: "#e8f5e9", color: "#2e7d32" },
    "Sociability":      { bg: "#e3f2fd", color: "#1565c0" },
    "Neurotic Tendency":{ bg: "#fce4ec", color: "#c62828" },
    "Self Sufficiency": { bg: "#fff8e1", color: "#f57f17" },
  };

  const getCategory = (cat) => categoryColors[cat] || { bg: "#f0faf5", color: "#2d5d50" };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f1eb", padding: "40px" }}>

      {/* LOGO */}
      <img
        src="/Logo.png"
        alt="logo"
        style={{
          position: "fixed",
          top: "20px",
          right: "25px",
          width: "75px",
          height: "75px",
          objectFit: "contain",
          borderRadius: "50%",
          background: "white",
          padding: "8px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.12)",
          zIndex: 100,
        }}
      />

      <div style={{ maxWidth: "900px", margin: "0 auto" }}>

        {/* HEADER */}
        <div style={{ marginBottom: "32px" }}>
          <p style={{
            color: "#2d5d50",
            letterSpacing: "2px",
            fontSize: "12px",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}>
            Question Bank
          </p>
          <h1 style={{ fontSize: "48px", fontWeight: "800", color: "#111", marginBottom: "6px" }}>
            All Questions
          </h1>
          <p style={{ color: "#888", fontSize: "16px" }}>
            {filteredQuestions.length} of {questions.length} questions
          </p>
        </div>

        {/* SEARCH + FILTER */}
        <div style={{
          display: "flex",
          gap: "14px",
          marginBottom: "28px",
          flexWrap: "wrap",
        }}>
          <input
            type="text"
            placeholder="🔍  Search questions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: "200px",
              padding: "14px 18px",
              borderRadius: "14px",
              border: "2px solid #e0e0e0",
              fontSize: "15px",
              outline: "none",
              background: "white",
              transition: "border 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "#2c7744"}
            onBlur={e => e.target.style.borderColor = "#e0e0e0"}
          />

          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            style={{
              padding: "14px 18px",
              borderRadius: "14px",
              border: "2px solid #e0e0e0",
              fontSize: "15px",
              outline: "none",
              background: "white",
              color: "#333",
              cursor: "pointer",
            }}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* CATEGORY PILLS */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "28px" }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: "8px 18px",
                borderRadius: "20px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "700",
                transition: "all 0.2s",
                background: selectedCategory === cat
                  ? "linear-gradient(135deg, #1f4037, #2c7744)"
                  : "white",
                color: selectedCategory === cat ? "white" : "#555",
                boxShadow: selectedCategory === cat
                  ? "0 4px 12px rgba(31,93,66,0.3)"
                  : "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* QUESTIONS LIST */}
        {filteredQuestions.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "60px",
            background: "white",
            borderRadius: "24px",
            color: "#999",
          }}>
            <div style={{ fontSize: "50px", marginBottom: "16px" }}>🔍</div>
            <h3 style={{ fontSize: "20px" }}>No questions found</h3>
          </div>
        ) : (
          filteredQuestions.map((q, index) => {
            const catStyle = getCategory(q.category);
            return (
              <div
                key={q._id}
                style={{
                  background: "white",
                  borderRadius: "20px",
                  padding: "28px 32px",
                  marginBottom: "20px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                  border: "2px solid transparent",
                  transition: "all 0.3s",
                  position: "relative",
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = "#2c7744"}
                onMouseOut={e => e.currentTarget.style.borderColor = "transparent"}
              >

                {/* TOP ROW */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "16px",
                  gap: "12px",
                }}>

                  {/* QUESTION NUMBER + TEXT */}
                  <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", flex: 1 }}>
                    <div style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #1f4037, #2c7744)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "800",
                      fontSize: "14px",
                      flexShrink: 0,
                    }}>
                      {index + 1}
                    </div>
                    <h3 style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "#111",
                      lineHeight: "1.5",
                      margin: 0,
                    }}>
                      {q.question}
                    </h3>
                  </div>

                  {/* CATEGORY BADGE */}
                  <span style={{
                    padding: "6px 14px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: "700",
                    background: catStyle.bg,
                    color: catStyle.color,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}>
                    {q.category}
                  </span>

                </div>

                {/* OPTIONS */}
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  marginLeft: "50px",
                  marginBottom: "16px",
                }}>
                  {q.options.map((option, i) => {
                    const isCorrect = option === q.correctAnswer;
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 16px",
                          borderRadius: "12px",
                          background: isCorrect ? "#f0faf5" : "#fafafa",
                          border: isCorrect ? "2px solid #2c7744" : "2px solid #f0f0f0",
                        }}
                      >
                        <span style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: isCorrect
                            ? "linear-gradient(135deg, #1f4037, #2c7744)"
                            : "#e8e8e8",
                          color: isCorrect ? "white" : "#888",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          fontWeight: "700",
                          flexShrink: 0,
                        }}>
                          {isCorrect ? "✓" : String.fromCharCode(65 + i)}
                        </span>
                        <span style={{
                          fontSize: "15px",
                          color: isCorrect ? "#1f4037" : "#444",
                          fontWeight: isCorrect ? "700" : "400",
                        }}>
                          {option}
                        </span>
                        {isCorrect && (
                          <span style={{
                            marginLeft: "auto",
                            fontSize: "11px",
                            color: "#2c7744",
                            fontWeight: "700",
                            letterSpacing: "0.05em",
                          }}>
                            CORRECT
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* DELETE BUTTON */}
                <div style={{ marginLeft: "50px" }}>
                  <button
                    onClick={() => handleDelete(q._id)}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "10px",
                      border: "none",
                      background: "#fff0f0",
                      color: "#e53e3e",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseOver={e => e.target.style.background = "#e53e3e" && (e.target.style.color = "white")}
                    onMouseOut={e => { e.target.style.background = "#fff0f0"; e.target.style.color = "#e53e3e"; }}
                  >
                    🗑 Delete
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ViewQuestions;