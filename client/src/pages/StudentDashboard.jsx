import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { getAuthHeaders } from "../utils/auth";
import { downloadCertificatePDF } from "../utils/certificate";

const API        = import.meta.env.VITE_API_URL || "http://localhost:5000";
const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

// Feature 9: Check if test is within availability window
const getAvailability = (suite) => {
  const now = new Date();
  if (suite.startDate && now < new Date(suite.startDate)) {
    return { available: false, reason: `Opens ${new Date(suite.startDate).toLocaleString()}` };
  }
  if (suite.endDate && now > new Date(suite.endDate)) {
    return { available: false, reason: "This test has closed" };
  }
  return { available: true, reason: "" };
};

const getResultSuiteId = (result) => String(result?.suiteId?._id || result?.suiteId || "");

const getResultPercentage = (result) =>
  result?.totalMarks > 0 ? Math.round(((result.score || 0) / result.totalMarks) * 100) : 0;

const isPassedResult = (result) =>
  typeof result?.passed === "boolean" ? result.passed : getResultPercentage(result) >= 50;

const formatDateTime = (value) => value ? new Date(value).toLocaleString("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
}) : "-";

const getUserId = (user) => String(user?._id || user?.id || "");

const getAssignmentDateForUser = (suite, user) => {
  const userId = getUserId(user);
  if (!userId) return null;
  const match = (suite.assignedUsersMeta || []).find(entry =>
    String(entry?.user?._id || entry?.user || "") === userId
  );
  return match?.assignedAt ? new Date(match.assignedAt) : null;
};

const latestPassedResultForSuite = (results, suiteId) =>
  results
    .filter(res => getResultSuiteId(res) === String(suiteId) && isPassedResult(res))
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0] || null;

const blocksRetake = (result, assignmentDate) =>
  Boolean(result && (!assignmentDate || new Date(result.submittedAt || 0) >= assignmentDate));

export default function CandidateDashboard() {
  const navigate = useNavigate();
  const [suites, setSuites]           = useState([]);
  const [pastResults, setPastResults] = useState([]);
  const [activeTab, setActiveTab]     = useState("available");
  const [loading, setLoading]         = useState(true);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const headers = getAuthHeaders();
        const userSearch = user.email || user.mobile || user.username || user.name || "";
        const [suitesRes, resultsRes] = await Promise.all([
          axios.get(`${API}/api/test-suites`, { headers }),
          axios.get(`${API}/api/results/all`, { headers, params: { search: userSearch } }),
        ]);
        // Feature 13: Only show active suites
        setSuites(suitesRes.data.filter(s => s.status === "active"));
        setPastResults(resultsRes.data);
      } catch (err) {
        console.error("Dashboard Load Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.email, user.mobile, user.username, user.name]);

  const tabStyle = (isActive) => ({
    padding: "10px 20px", cursor: "pointer", fontWeight: "700", fontSize: "14px",
    color: isActive ? GREEN : "#8A8A7E",
    borderBottom: isActive ? `3px solid ${GREEN}` : "3px solid transparent",
    transition: "all 0.2s",
  });

  return (
    <div className="candidate-dashboard-page" style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div className="candidate-dashboard-header" style={{ padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", color: GREEN_DARK }}>Hi, {user.name || "Candidate"}!</h1>
          <p style={{ margin: 0, color: "#6B6B5E" }}>{user.project} • {user.designation}</p>
        </div>
        <button onClick={() => { localStorage.clear(); navigate("/"); }}
          style={{ color: "#C0392B", border: "none", background: "none", cursor: "pointer", fontWeight: "600" }}>
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="candidate-dashboard-tabs" style={{ display: "flex", gap: "20px", padding: "0 28px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
        <div style={tabStyle(activeTab === "available")} onClick={() => setActiveTab("available")}>Available Tests</div>
        <div style={tabStyle(activeTab === "history")} onClick={() => setActiveTab("history")}>My History & Certificates</div>
      </div>

      <div className="candidate-dashboard-content" style={{ padding: "28px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>Loading...</div>
        ) : activeTab === "available" ? (
          <div className="candidate-test-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
            {suites.length === 0 ? (
              <p style={{ color: "#888" }}>No active tests available right now.</p>
            ) : suites.map(suite => {
              const { available, reason } = getAvailability(suite);
              const latestPassedAttempt = latestPassedResultForSuite(pastResults, suite._id);
              const assignmentDate = getAssignmentDateForUser(suite, user);
              const passedAttempt = blocksRetake(latestPassedAttempt, assignmentDate)
                ? latestPassedAttempt
                : null;
              const failedAttempt = pastResults.find(res =>
                getResultSuiteId(res) === String(suite._id) && !isPassedResult(res)
              );
              const reassignedAfterPass = latestPassedAttempt && assignmentDate && !passedAttempt;
              return (
                <div className="candidate-test-card" key={suite._id} style={{ background: WHITE, padding: "24px", borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)", opacity: available && !passedAttempt ? 1 : 0.75 }}>
                  <h3 style={{ margin: "0 0 8px", color: GREEN_DARK }}>{suite.name}</h3>
                  {suite.description && (
                    <p style={{ fontSize: "14px", color: "#666", marginBottom: "12px" }}>{suite.description}</p>
                  )}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", color: "#888" }}>⏱ {suite.duration || 30} min</span>
                    <span style={{ fontSize: "12px", color: "#888" }}>• {suite.effectiveQuestionCount || suite.questionCount || 0} questions</span>
                    {suite.questionSelectionMode === "selected" && (
                      <span style={{ fontSize: "12px", color: "#f59e0b" }}>• 📌 selected set</span>
                    )}
                    {(suite.questionSelectionMode === "random" || (!suite.questionSelectionMode && suite.questionsToServe)) && suite.questionsToServe && (
                      <span style={{ fontSize: "12px", color: "#f59e0b" }}>• 🎲 {suite.questionsToServe} random</span>
                    )}
                  </div>

                  {/* Feature 9: Show date window info */}
                  {suite.startDate && (
                    <p style={{ fontSize: "11px", color: "#6366f1", marginBottom: "12px" }}>
                      📅 {new Date(suite.startDate).toLocaleString()} — {suite.endDate ? new Date(suite.endDate).toLocaleString() : "No end"}
                    </p>
                  )}

                  {/* Feature 9: Block start if outside window */}
                  {!available ? (
                    <div style={{ width: "100%", padding: "12px", background: "#f3f4f6", color: "#888", borderRadius: "8px", fontWeight: "600", fontSize: "13px", textAlign: "center" }}>
                      🔒 {reason}
                    </div>
                  ) : passedAttempt ? (
                    <div style={{ width: "100%", padding: "12px", background: "#eef8f1", color: GREEN_DARK, border: "1px solid #c6e2d0", borderRadius: "8px", fontWeight: "700", fontSize: "13px", textAlign: "center" }}>
                      You already attempted this test.
                    </div>
                  ) : (
                    <button
                      onClick={() => navigate(`/test/${suite._id}`)}
                      style={{ width: "100%", padding: "12px", background: GREEN, color: WHITE, border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
                    >
                      {reassignedAfterPass || failedAttempt ? "Retest Assessment →" : "Start Assessment →"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {pastResults.length === 0 ? (
              <p style={{ color: "#888" }}>No results yet. Complete a test to see it here!</p>
            ) : pastResults.map(res => {
              const pct = getResultPercentage(res);
              const historySuiteId = typeof res.suiteId === "string" ? res.suiteId : res.suiteId?._id;
              const passed = isPassedResult(res);
              return (
                <div className="candidate-history-card" key={res._id} style={{ background: WHITE, padding: "16px 24px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <div>
                    <h4 style={{ margin: 0, color: GREEN_DARK }}>{res.suiteId?.name || "Assessment"}</h4>
                    <span style={{ fontSize: "12px", color: "#888" }}>{formatDateTime(res.submittedAt)}</span>
                  </div>
                  <div className="candidate-history-actions" style={{ textAlign: "right", display: "grid", gap: "8px", justifyItems: "end" }}>
                    <div style={{ fontWeight: "700", color: passed ? GREEN : "#C0392B" }}>
                      {res.score} / {res.totalMarks} ({pct}%)
                    </div>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: passed ? GREEN : "#C0392B" }}>
                      {passed ? "✓ PASSED" : "✗ FAILED"}
                    </div>
                    {passed ? (
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => downloadCertificatePDF(res, {}, "english")}
                          style={{ padding: "8px 12px", border: "none", borderRadius: "9px", background: GREEN, color: WHITE, fontSize: "12px", fontWeight: "800", cursor: "pointer" }}
                        >
                          English Certificate
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadCertificatePDF(res, {}, "marathi")}
                          style={{ padding: "8px 12px", border: `1px solid ${GREEN}`, borderRadius: "9px", background: WHITE, color: GREEN_DARK, fontSize: "12px", fontWeight: "800", cursor: "pointer" }}
                        >
                          Marathi Certificate
                        </button>
                      </div>
                    ) : historySuiteId ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/test/${historySuiteId}`)}
                        style={{ padding: "8px 12px", border: "1px solid #C0392B", borderRadius: "9px", background: WHITE, color: "#C0392B", fontSize: "12px", fontWeight: "800", cursor: "pointer" }}
                      >
                        Retest
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
