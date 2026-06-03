// src/pages/AdminSuiteResults.jsx
// Route: /admin/results?suite=SUITE_ID
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { downloadResultsPDF } from "../utils/downloadResults";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

const STATUS_COLOR = {
  Pass: { background: "#dcfce7", color: "#166534" },
  Fail: { background: "#fee2e2", color: "#991b1b" },
};

function pctColor(pct) {
  if (pct >= 75) return "#166534";
  if (pct >= 50) return "#92400e";
  return "#dc2626";
}

export default function AdminSuiteResults() {
  const [searchParams]          = useSearchParams();
  const navigate                = useNavigate();
  const suiteId                 = searchParams.get("suite");

  const [suite, setSuite]       = useState(null);
  const [questions, setQuestions] = useState([]);
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError]       = useState("");
  

  // All categories in this suite
  const allCats = [...new Set(questions.map(q => q.category || "Uncategorized"))];

  useEffect(() => {
    if (!suiteId) { setError("No suite ID provided."); setLoading(false); return; }
    const fetchAll = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };
        const [suiteRes, qRes, rRes] = await Promise.all([
          axios.get(`${API}/api/test-suites/${suiteId}`, { headers }),
          axios.get(`${API}/api/test-suites/${suiteId}/questions`, { headers }),
          axios.get(`${API}/api/results/suite/${suiteId}`, { headers }),
        ]);
        setSuite(suiteRes.data);
        setQuestions(qRes.data);
        setResults(rRes.data);
      } catch (err) {
        console.error(err);
        setError("Could not load results.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [suiteId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadResultsPDF(suite, questions, results);
    } catch (err) {
      console.error("PDF error:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  // Per-result stats (category breakdown)
  const enriched = results.map(r => {
    const catMap = {};
    questions.forEach(q => {
      const cat = q.category || "Uncategorized";
      if (!catMap[cat]) catMap[cat] = { total: 0, correct: 0, marks: 0, earned: 0 };
      catMap[cat].total++;
      catMap[cat].marks += q.marks ?? 1;
    });
    (r.answers || []).forEach(ans => {
      const q = questions.find(q => q._id === ans.questionId || q._id?.toString() === ans.questionId?.toString());
      if (!q) return;
      const cat = q.category || "Uncategorized";
      if (ans.isCorrect) { catMap[cat].correct++; catMap[cat].earned += q.marks ?? 1; }
    });
    const pct = r.totalMarks > 0 ? Math.round((r.score / r.totalMarks) * 100) : 0;
    return { ...r, catMap, pct };
  });

  if (loading) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", color: "#aaa" }}>
      Loading results…
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: WHITE, borderRadius: "16px", padding: "32px", textAlign: "center" }}>
        <p style={{ color: "#dc2626" }}>{error}</p>
        <button onClick={() => navigate("/dashboard")} style={{ padding: "10px 24px", background: GREEN, color: WHITE, border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{ padding: "16px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: WHITE, border: "0.5px solid rgba(0,0,0,0.1)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="Logo" style={{ width: "48px", height: "48px", objectFit: "contain" }} onError={e => { e.target.style.display = "none"; }} />
          </div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: GREEN_DARK }}>{suite?.name} — Results</div>
            <div style={{ fontSize: "13px", color: "#6B6B5E", marginTop: "2px" }}>{results.length} submission{results.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading || results.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 20px", background: downloading ? "#aaa" : GREEN, color: WHITE,
            border: "none", borderRadius: "22px", fontSize: "14px", fontWeight: "600",
            cursor: downloading || results.length === 0 ? "not-allowed" : "pointer",
            opacity: results.length === 0 ? 0.5 : 1,
          }}
        >
          {downloading ? "Generating…" : "⬇ Download PDF"}
        </button>
      </div>

      {/* ── Nav ── */}
      <div style={{ padding: "12px 28px", display: "flex", gap: "16px", alignItems: "center", borderBottom: "0.5px solid rgba(0,0,0,0.09)", marginTop: "4px" }}>
        <span onClick={() => navigate(`/admin/test-suites/${suiteId}`)} style={{ fontSize: "14px", color: "#4A7A5C", fontWeight: "500", cursor: "pointer" }}>
          ← Back to suite
        </span>
        <span onClick={() => { localStorage.removeItem("token"); navigate("/"); }} style={{ fontSize: "14px", color: "#C0392B", fontWeight: "500", cursor: "pointer", marginLeft: "auto" }}>
          Logout
        </span>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "24px 28px", overflowX: "auto" }}>

        {results.length === 0 ? (
          <div style={{ background: WHITE, borderRadius: "16px", border: "0.5px solid rgba(0,0,0,0.08)", padding: "48px 28px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>📭</div>
            <p style={{ color: "#A0A098", fontSize: "15px", margin: 0 }}>No submissions yet for this test suite.</p>
          </div>
        ) : (
          <div style={{ background: WHITE, borderRadius: "16px", border: "0.5px solid rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: GREEN_DARK }}>
                  {["#", "Student", "Email", "Score", "%", "Result", ...allCats].map((h, i) => (
                    <th key={i} style={{ padding: "12px 14px", color: WHITE, fontWeight: "700", textAlign: i >= 3 ? "center" : "left", whiteSpace: "nowrap", fontSize: "12px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.map((r, i) => {
                  const status = r.pct >= 50 ? "Pass" : "Fail";
                  return (
                    <tr key={r._id} style={{ borderBottom: "1px solid #f0f0ea", background: i % 2 === 0 ? WHITE : "#fafaf8" }}>
                      <td style={{ padding: "12px 14px", color: "#aaa", textAlign: "center" }}>{i + 1}</td>
                      <td style={{ padding: "12px 14px", fontWeight: "600", color: GREEN_DARK }}>{r.studentName || "—"}</td>
                      <td style={{ padding: "12px 14px", color: "#888" }}>{r.studentEmail || "—"}</td>
                      <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: "600" }}>{r.score}/{r.totalMarks}</td>
                      <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: "700", color: pctColor(r.pct) }}>{r.pct}%</td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <span style={{ padding: "3px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", ...STATUS_COLOR[status] }}>
                          {status}
                        </span>
                      </td>
                      {allCats.map(cat => {
                        const s = r.catMap[cat] || { correct: 0, total: 0, marks: 0, earned: 0 };
                        const p = s.marks > 0 ? Math.round((s.earned / s.marks) * 100) : 0;
                        return (
                          <td key={cat} style={{ padding: "12px 14px", textAlign: "center" }}>
                            <div style={{ fontWeight: "600", color: pctColor(p), fontSize: "13px" }}>{p}%</div>
                            <div style={{ fontSize: "11px", color: "#aaa" }}>{s.correct}/{s.total}</div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
