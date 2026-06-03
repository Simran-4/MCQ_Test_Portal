// src/pages/CandidateDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

const STATUS_COLOR = {
  active:    { background: "#dcfce7", color: "#166534" },
  draft:     { background: "#f3f4f6", color: "#4b5563" },
  scheduled: { background: "#fef3c7", color: "#92400e" },
};

export default function CandidateDashboard() {
  const navigate = useNavigate();
  const [suites, setSuites]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Get Candidate name from token stored at login
  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user")) || {}; }
    catch { return {}; }
  })();

  useEffect(() => {
    const fetchActiveSuites = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`${API}/api/test-suites/active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSuites(res.data);
      } catch (err) {
        console.error("Failed to fetch test suites:", err);
        setError("Could not load tests. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchActiveSuites();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{ padding: "16px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: WHITE, border: "0.5px solid rgba(0,0,0,0.1)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <img
              src={`${import.meta.env.BASE_URL}Logo.png`}
              alt="Snehalaya"
              style={{ width: "48px", height: "48px", objectFit: "contain" }}
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: GREEN_DARK, lineHeight: 1.2 }}>
              Welcome{user.name ? `, ${user.name}` : ""}!
            </div>
            <div style={{ fontSize: "13px", color: "#6B6B5E", marginTop: "2px" }}>
              Choose a test below to get started.
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{ fontSize: "14px", color: "#C0392B", fontWeight: "500", cursor: "pointer", background: "none", border: "none" }}
        >
          Logout
        </button>
      </div>

      {/* ── Divider ── */}
      <div style={{ borderBottom: "0.5px solid rgba(0,0,0,0.09)", margin: "12px 0 0" }} />

      {/* ── Content ── */}
      <div style={{ padding: "24px 28px" }}>

        <div style={{ marginBottom: "18px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#8A8A7E", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Available Tests
          </span>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "#aaa", padding: "48px 0" }}>Loading tests…</p>

        ) : error ? (
          <div style={{ background: WHITE, borderRadius: "16px", border: "1px solid #fecaca", padding: "32px", textAlign: "center" }}>
            <p style={{ color: "#dc2626", fontSize: "15px", margin: 0 }}>{error}</p>
          </div>

        ) : suites.length === 0 ? (
          <div style={{ background: WHITE, borderRadius: "16px", border: "0.5px solid rgba(0,0,0,0.08)", padding: "48px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#E8F2EC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>📋</div>
            <p style={{ color: "#A0A098", fontSize: "15px", margin: 0 }}>No tests are available right now.</p>
            <p style={{ color: "#C0C0B8", fontSize: "13px", margin: 0 }}>Check back later or contact your admin.</p>
          </div>

        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "14px" }}>
            {suites.map(suite => (
              <div
                key={suite._id}
                style={{ background: WHITE, border: "1px solid #e5e7eb", borderRadius: "14px", padding: "20px", display: "flex", flexDirection: "column", gap: "10px", transition: "border-color 0.2s, box-shadow 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = GREEN; e.currentTarget.style.boxShadow = "0 4px 16px rgba(45,95,63,0.10)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
              >
                {/* Suite header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <p style={{ fontWeight: "700", fontSize: "15px", color: GREEN_DARK, margin: 0, flex: 1, marginRight: "8px" }}>
                    {suite.name}
                  </p>
                  <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "999px", fontWeight: "600", whiteSpace: "nowrap", ...(STATUS_COLOR[suite.status] || STATUS_COLOR.draft) }}>
                    {suite.status}
                  </span>
                </div>

                {suite.description && (
                  <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{suite.description}</p>
                )}

                {/* Question count */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", background: "#E8F2EC", color: GREEN_DARK, padding: "3px 10px", borderRadius: "999px", fontWeight: "600" }}>
                    {suite.questionCount ?? 0} question{suite.questionCount !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Start button */}
                <button
                  onClick={() => navigate(`/test/${suite._id}`)}
                  style={{ marginTop: "auto", padding: "10px", fontSize: "14px", fontWeight: "600", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", cursor: "pointer", transition: "background 0.2s" }}
                  onMouseEnter={e => e.currentTarget.style.background = GREEN_DARK}
                  onMouseLeave={e => e.currentTarget.style.background = GREEN}
                >
                  Start Test →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
