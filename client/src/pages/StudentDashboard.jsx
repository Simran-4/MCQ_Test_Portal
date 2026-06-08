import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "https://charismatic-happiness-production-dc36.up.railway.app/api";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

export default function CandidateDashboard() {
  const navigate = useNavigate();
  const [suites, setSuites] = useState([]);
  const [pastResults, setPastResults] = useState([]); // Feature: History
  const [activeTab, setActiveTab] = useState("available"); // 'available' or 'history'
  const [loading, setLoading] = useState(true);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        // Fetch active tests and user's past results in parallel
        const [suitesRes, resultsRes] = await Promise.all([
          axios.get(`${API}/test-suites/active`, { headers }),
          axios.get(`${API}/results/my/${user.email}`, { headers })
        ]);

        setSuites(suitesRes.data);
        setPastResults(resultsRes.data);
      } catch (err) {
        console.error("Dashboard Load Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.email]);

  const tabStyle = (isActive) => ({
    padding: "10px 20px",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "14px",
    color: isActive ? GREEN : "#8A8A7E",
    borderBottom: isActive ? `3px solid ${GREEN}` : "3px solid transparent",
    transition: "all 0.2s"
  });

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header (Keep as is) */}
      <div style={{ padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", color: GREEN_DARK }}>Hi, {user.name || "Candidate"}!</h1>
          <p style={{ margin: 0, color: "#6B6B5E" }}>{user.project} • {user.designation}</p>
        </div>
        <button onClick={() => { localStorage.clear(); navigate("/"); }} style={{ color: "#C0392B", border: "none", background: "none", cursor: "pointer", fontWeight: "600" }}>Logout</button>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: "20px", padding: "0 28px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
        <div style={tabStyle(activeTab === "available")} onClick={() => setActiveTab("available")}>Available Tests</div>
        <div style={tabStyle(activeTab === "history")} onClick={() => setActiveTab("history")}>My History & Certificates</div>
      </div>

      <div style={{ padding: "28px" }}>
        {activeTab === "available" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
            {suites.map(suite => (
              <div key={suite._id} style={{ background: WHITE, padding: "24px", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
                <h3 style={{ margin: "0 0 10px", color: GREEN_DARK }}>{suite.name}</h3>
                <p style={{ fontSize: "14px", color: "#666" }}>{suite.description}</p>
                <button 
                  onClick={() => navigate(`/test/${suite._id}`)}
                  style={{ width: "100%", padding: "12px", background: GREEN, color: WHITE, border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
                >
                  Start Assessment
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* HISTORY TAB */
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {pastResults.length === 0 ? (
              <p>No results yet. Complete a test to see it here!</p>
            ) : (
              pastResults.map(res => (
                <div key={res._id} style={{ background: WHITE, padding: "16px 24px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: 0, color: GREEN_DARK }}>{res.suiteId?.name || "Assessment"}</h4>
                    <span style={{ fontSize: "12px", color: "#888" }}>Completed on {new Date(res.submittedAt).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: "700", color: res.passed ? GREEN : "#C0392B" }}>{res.score}/{res.totalMarks}</div>
                      <div style={{ fontSize: "11px", fontWeight: "800" }}>{res.passed ? "PASSED" : "FAILED"}</div>
                    </div>
                    {/* Only show certificate button if they passed */}
                    {res.passed && (
                      <button 
                         onClick={() => navigate(`/test/${res.suiteId?._id}`, { state: { viewOnly: true, resultId: res._id } })}
                         style={{ background: "#E8F2EC", color: GREEN, border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                      >
                        Certificate 🎓
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}