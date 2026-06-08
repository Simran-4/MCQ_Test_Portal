import { useEffect, useState } from "react";
import axios from "axios";

const API = "https://charismatic-happiness-production-dc36.up.railway.app";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#f5f1eb";
const WHITE      = "#ffffff";

// ── Group duplicate categories and sum their marks ──
function groupCategories(categoryResults) {
  const map = {};
  categoryResults.forEach(item => {
    const key = item.category;
    if (!map[key]) {
      map[key] = { category: key, score: 0, total: 0, earnedMarks: 0, totalMarks: 0 };
    }
    map[key].score       += item.score       ?? 0;
    map[key].total       += item.total       ?? 0;
    map[key].earnedMarks += item.earnedMarks ?? item.score ?? 0;
    map[key].totalMarks  += item.total       ?? 0;
  });
  return Object.values(map).map(item => ({
    ...item,
    percentage: item.totalMarks > 0
      ? Math.round((item.earnedMarks / item.totalMarks) * 100)
      : 0,
  }));
}

function pctColor(pct) {
  if (pct >= 70) return "#16a34a";
  if (pct >= 40) return "#d97706";
  return "#dc2626";
}

function pctLabel(pct) {
  if (pct >= 70) return "High";
  if (pct >= 40) return "Moderate";
  return "Low";
}

function ViewResults() {
  const [results, setResults] = useState([]);
  const [user, setUser]       = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user")) || null;
    setUser(storedUser);
    if (storedUser) fetchResults(storedUser);
  }, []);

  const fetchResults = async (storedUser) => {
    try {
      let res;
      if (storedUser.role === "admin" || storedUser.role === "superadmin") {
        res = await axios.get(`${API}/api/results/all`);
      } else {
        res = await axios.get(`${API}/api/results/my/${storedUser.email}`);
      }
      setResults(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <div style={{ minHeight: "100vh", background: BG, padding: "40px", fontFamily: "'Segoe UI', sans-serif" }}>

      <img src="/Logo.png" alt="logo" style={{
        position: "fixed", top: "25px", right: "25px",
        width: "80px", height: "80px", objectFit: "contain",
        borderRadius: "50%", background: WHITE, padding: "8px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.12)", zIndex: 100,
      }} />

      <div style={{
        maxWidth: "850px", margin: "auto", background: WHITE,
        padding: "40px", borderRadius: "25px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.08)",
      }}>
        <p style={{ color: GREEN, letterSpacing: "2px", fontSize: "13px", fontWeight: "700", textTransform: "uppercase" }}>
          {isAdmin ? "Admin View" : "Your Profile"}
        </p>
        <h1 style={{ fontSize: "40px", marginBottom: "8px", color: GREEN_DARK }}>
          {isAdmin ? "All Candidate Results" : "Here is what we found"}
        </h1>

        {!isAdmin && user && (
          <p style={{ color: "#888", fontSize: "15px", marginBottom: "30px" }}>
            Results for <strong>{user.name}</strong> ({user.email})
          </p>
        )}
        {isAdmin && (
          <p style={{ color: "#888", fontSize: "15px", marginBottom: "30px" }}>
            Showing all candidate results · {results.length} submission{results.length !== 1 ? "s" : ""}
          </p>
        )}

        {!results || results.length === 0 ? (
          <h2 style={{ color: "#999", marginTop: "40px" }}>No Results Found</h2>
        ) : (
          results.map((result, index) => {

            // ── Group & deduplicate categories ──
            const raw        = result.categoryResults && result.categoryResults.length > 0 ? result.categoryResults : [];
            const categories = groupCategories(raw);

            // ── Correct total marks ──
            const totalMarks = result.totalMarks || result.totalQuestions || 0;
            const score      = result.score ?? 0;
            const pct        = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
            const passed     = pct >= 50;

            return (
              <div key={index} style={{
                marginBottom: "50px",
                borderBottom: index < results.length - 1 ? "2px solid #f0f0f0" : "none",
                paddingBottom: "40px",
              }}>

                {/* ── Admin candidate header ── */}
                {isAdmin && (
                  <div style={{ background: BG, borderRadius: "14px", padding: "16px 20px", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h3 style={{ fontSize: "18px", color: GREEN_DARK, margin: "0 0 3px" }}>
                        {result.CandidateName || result.userName}
                      </h3>
                      <p style={{ color: "#888", fontSize: "13px", margin: 0 }}>
                        {result.CandidateEmail || result.userEmail}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "22px", fontWeight: "800", color: pctColor(pct) }}>{pct}%</div>
                      <div style={{ fontSize: "12px", color: "#aaa" }}>{score} / {totalMarks} marks</div>
                      <span style={{
                        fontSize: "11px", padding: "3px 10px", borderRadius: "999px", fontWeight: "700",
                        background: passed ? "#dcfce7" : "#fee2e2",
                        color: passed ? "#166534" : "#dc2626",
                      }}>{passed ? "PASS" : "FAIL"}</span>
                    </div>
                  </div>
                )}

                {/* ── Candidate overall score ── */}
                {!isAdmin && (
                  <div style={{
                    display: "inline-block", background: "#f0faf5",
                    border: `2px solid ${GREEN}`, borderRadius: "16px",
                    padding: "10px 24px", marginBottom: "28px",
                    color: GREEN_DARK, fontWeight: "700", fontSize: "16px",
                  }}>
                    Overall Score: {score} / {totalMarks} &nbsp;·&nbsp; {pct}%
                    &nbsp;·&nbsp;
                    <span style={{ color: passed ? "#16a34a" : "#dc2626" }}>{passed ? "PASS" : "FAIL"}</span>
                  </div>
                )}

                {/* ── Category breakdown ── */}
                {categories.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                    {categories.map((item, i) => {
                      const level = pctLabel(item.percentage);
                      const color = pctColor(item.percentage);
                      return (
                        <div key={i}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h2 style={{ fontSize: "22px", margin: 0, color: "#111", fontWeight: "700" }}>{item.category}</h2>
                            <span style={{ fontSize: "18px", fontWeight: "800", color }}>{item.percentage}%</span>
                          </div>

                          <div style={{ width: "100%", height: "8px", background: "#e5e5e0", borderRadius: "10px", overflow: "hidden", marginTop: "10px" }}>
                            <div style={{ width: `${item.percentage}%`, height: "100%", background: color, borderRadius: "10px", transition: "width 0.5s ease" }} />
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
                            <span style={{ background: "#eee5d0", padding: "4px 14px", borderRadius: "20px", fontWeight: "700", fontSize: "13px", color }}>{level}</span>
                            <span style={{ color: "#999", fontSize: "13px" }}>
                              {item.earnedMarks} / {item.totalMarks} marks &nbsp;·&nbsp; {item.score}/{item.total} correct
                            </span>
                          </div>

                          <p style={{ marginTop: "10px", color: "#666", lineHeight: "1.7", fontSize: "14px" }}>
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
                ) : (
                  <p style={{ color: "#aaa", fontStyle: "italic" }}>No category breakdown available for this result.</p>
                )}

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ViewResults;