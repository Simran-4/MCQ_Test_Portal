import { useEffect, useState } from "react";
import axios from "axios";

function ViewResults() {

  const [results, setResults] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user")) || null;
    setUser(storedUser);
    if (storedUser) {
      fetchResults(storedUser);
    }
  }, []);

  const fetchResults = async (storedUser) => {
    try {
      let res;
      if (storedUser.role === "teacher") {
        res = await axios.get("http://localhost:3000/api/results/all");
      } else {
        res = await axios.get(
          `http://localhost:3000/api/results/my/${storedUser.email}`
        );
      }
      setResults(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f1eb", padding: "40px" }}>

      {/* LOGO */}
      <img
        src="/Logo.png"
        alt="logo"
        style={{
          position: "fixed",
          top: "25px",
          right: "25px",
          width: "80px",
          height: "80px",
          objectFit: "contain",
          borderRadius: "50%",
          background: "white",
          padding: "8px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.12)",
          zIndex: 100,
        }}
      />

      <div
        style={{
          maxWidth: "850px",
          margin: "auto",
          background: "white",
          padding: "40px",
          borderRadius: "25px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.08)",
        }}
      >
        <p style={{ color: "#2d5d50", letterSpacing: "2px", fontSize: "13px" }}>
          YOUR PROFILE
        </p>

        <h1 style={{ fontSize: "52px", marginBottom: "8px" }}>
          Here is what we found
        </h1>

        {user && user.role !== "teacher" && (
          <p style={{ color: "#888", fontSize: "16px", marginBottom: "30px" }}>
            Results for <strong>{user.name}</strong> ({user.email})
          </p>
        )}

        {!results || results.length === 0 ? (
          <h2 style={{ color: "#999", marginTop: "40px" }}>No Results Found</h2>
        ) : (
          results.map((result, index) => (
            <div
              key={index}
              style={{
                marginBottom: "50px",
                borderBottom: index < results.length - 1 ? "2px solid #f0f0f0" : "none",
                paddingBottom: "40px",
              }}
            >
              {/* Teacher sees student name */}
              {user && user.role === "teacher" && (
                <div style={{ marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "22px", color: "#333", margin: 0 }}>
                    {result.userName}
                  </h3>
                  <p style={{ color: "#888", fontSize: "15px", marginTop: "4px" }}>
                    {result.userEmail} &nbsp;|&nbsp; Score: {result.score} / {result.totalQuestions}
                  </p>
                </div>
              )}

              {/* Student sees overall score */}
              {user && user.role !== "teacher" && (
                <div
                  style={{
                    display: "inline-block",
                    background: "#f0faf5",
                    border: "2px solid #2d5d50",
                    borderRadius: "16px",
                    padding: "10px 24px",
                    marginBottom: "28px",
                    color: "#2d5d50",
                    fontWeight: "700",
                    fontSize: "16px",
                  }}
                >
                  Overall Score: {result.score} / {result.totalQuestions}
                </div>
              )}

              {/* Category Results */}
              {result.categoryResults &&
                result.categoryResults.length > 0 &&
                result.categoryResults.map((item, i) => {

                  const percentage = item.percentage;
                  let level = "Low";
                  if (percentage >= 70) level = "High";
                  else if (percentage >= 40) level = "Moderate";

                  const levelColor =
                    level === "High" ? "#16a34a" :
                    level === "Moderate" ? "#d97706" : "#dc2626";

                  return (
                    <div key={i} style={{ marginBottom: "40px" }}>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h2 style={{ fontSize: "34px", margin: 0, color: "#111" }}>
                          {item.category}
                        </h2>
                        <h3 style={{ color: "#777", margin: 0 }}>{percentage}%</h3>
                      </div>

                      <div style={{ width: "100%", height: "10px", background: "#ddd", borderRadius: "10px", overflow: "hidden", marginTop: "12px" }}>
                        <div
                          style={{
                            width: `${percentage}%`,
                            height: "100%",
                            background: "#2d5d50",
                            borderRadius: "10px",
                            transition: "width 0.5s ease",
                          }}
                        ></div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "14px" }}>
                        <span
                          style={{
                            background: "#eee5d0",
                            padding: "6px 16px",
                            borderRadius: "20px",
                            fontWeight: "700",
                            fontSize: "14px",
                            color: levelColor,
                          }}
                        >
                          {level}
                        </span>
                        <span style={{ color: "#666", fontSize: "14px" }}>
                          Raw Score: {item.score}/{item.total}
                        </span>
                      </div>

                      <p style={{ marginTop: "16px", color: "#666", lineHeight: "1.7", fontSize: "15px" }}>
                        {level === "High"
                          ? `Excellent performance in ${item.category}. Keep it up!`
                          : level === "Moderate"
                          ? `Average performance in ${item.category}. There is room to improve.`
                          : `Needs improvement in ${item.category}. Focus on this area.`}
                      </p>

                    </div>
                  );
                })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ViewResults;