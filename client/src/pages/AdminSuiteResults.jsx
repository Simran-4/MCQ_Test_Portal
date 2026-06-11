// src/pages/AdminSuiteResults.jsx
import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { downloadResultsPDF, downloadResultsExcel } from "../utils/downloadResults";
import { getAuthHeaders } from "../utils/auth";

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

// ── Helper: get categories for a question (always returns array) ──
function getQuestionCats(q) {
  if (Array.isArray(q.category) && q.category.length > 0) return q.category;
  if (typeof q.category === "string" && q.category.trim()) return [q.category.trim()];
  return ["Uncategorized"];
}

function isTheoryQuestion(q) {
  return q?.questionType === "theory";
}

function getCategoryAnswerMap(q) {
  if (!q?.categoryCorrectAnswers) return {};
  if (q.categoryCorrectAnswers instanceof Map) return Object.fromEntries(q.categoryCorrectAnswers);
  return q.categoryCorrectAnswers;
}

function uniqueIndexes(indexes) {
  return [...new Set((Array.isArray(indexes) ? indexes : []).map(Number))]
    .filter(Number.isInteger);
}

function getCorrectAnswersForCategory(q, cat) {
  const fallback = uniqueIndexes(Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]);
  const map = getCategoryAnswerMap(q);
  const categoryAnswers = uniqueIndexes(map[cat]);
  return categoryAnswers.length > 0 ? categoryAnswers : fallback;
}

function scoreSelected(selectedArr, correctArr) {
  if (correctArr.length === 0) return { earnedFrac: 0, isRight: false };
  const hits = selectedArr.filter(i => correctArr.includes(i)).length;
  const wrongs = selectedArr.filter(i => !correctArr.includes(i)).length;
  const earnedFrac = Math.max(0, (hits - wrongs) / correctArr.length);
  return { earnedFrac, isRight: earnedFrac === 1 };
}

// ══════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function AdminSuiteResults() {
  const [searchParams]              = useSearchParams();
  const params                      = useParams();
  const navigate                    = useNavigate();
  const suiteId                     = searchParams.get("suite") || params.suiteId;

  const [suite, setSuite]           = useState(null);
  const [questions, setQuestions]   = useState([]);
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [dlType, setDlType]         = useState("");
  const [showDownloads, setShowDownloads] = useState(false);
  const [error, setError]           = useState("");
  const [search, setSearch]         = useState("");
  const [suiteStatus, setSuiteStatus] = useState(null);

  // ✅ FIXED: flatten multi-category arrays to get all unique categories
  const allCats = [...new Set(
    questions.filter(q => !isTheoryQuestion(q)).flatMap(q => getQuestionCats(q))
  )];

  useEffect(() => {
    if (!suiteId) { setError("No suite ID provided."); setLoading(false); return; }
    const fetchAll = async () => {
      try {
        const headers = getAuthHeaders();
        const [suiteRes, qRes, rRes] = await Promise.all([
          axios.get(`${API}/api/test-suites/${suiteId}`, { headers }),
          axios.get(`${API}/api/test-suites/${suiteId}/questions`, { headers }),
          axios.get(`${API}/api/results/suite/${suiteId}`, { headers }),
        ]);
        setSuite(suiteRes.data);
        setSuiteStatus(suiteRes.data.status || "active");
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

  const handleToggleStatus = async () => {
    try {
      const newStatus = suiteStatus === "active" ? "draft" : "active";
      const res   = await axios.put(
        `${API}/api/test-suites/${suiteId}`,
        { status: newStatus },
        { headers: getAuthHeaders() }
      );
      setSuiteStatus(res.data.status || newStatus);
      setSuite(prev => ({ ...prev, status: res.data.status || newStatus }));
    } catch (err) {
      console.error(err);
      alert("Failed to toggle test status.");
    }
  };

  const handleDownloadPDF = async (reportType) => {
    setDownloading(true); setDlType(`${reportType}-pdf`);
    try { await downloadResultsPDF(suite, questions, results, { reportType }); }
    catch (err) { console.error(err); alert("Failed to generate PDF."); }
    finally { setDownloading(false); setDlType(""); }
  };

  const handleDownloadExcel = (reportType) => {
    setDownloading(true); setDlType(`${reportType}-excel`);
    try { downloadResultsExcel(suite, questions, results, { reportType }); }
    catch (err) { console.error(err); alert("Failed to generate Excel."); }
    finally { setDownloading(false); setDlType(""); }
  };

  // ✅ FIXED: Per-result stats now correctly handles multi-category questions
  const enriched = results.map(r => {
    // Build catMap with ALL categories from ALL questions
    const catMap = {};
    questions.forEach(q => {
      if (isTheoryQuestion(q)) return;
      const cats = getQuestionCats(q);
      const marks = q.marks ?? 1;
      // Each category the question belongs to gets its own entry
      cats.forEach(cat => {
        if (!catMap[cat]) catMap[cat] = { total: 0, correct: 0, marks: 0, earned: 0 };
        catMap[cat].total++;
        catMap[cat].marks += marks;
      });
    });

    // Now score each answer against each category's own answer key
    (r.answers || []).forEach(ans => {
      const q = questions.find(
        q => q._id === ans.questionId || q._id?.toString() === ans.questionId?.toString()
      );
      if (!q || isTheoryQuestion(q)) return;
      const cats = getQuestionCats(q);
      const marks = q.marks ?? 1;
      const selectedArr = Array.isArray(ans.selectedOptions) ? ans.selectedOptions : [];
      cats.forEach(cat => {
        if (!catMap[cat]) catMap[cat] = { total: 0, correct: 0, marks: 0, earned: 0 };
        const { earnedFrac, isRight } = scoreSelected(
          selectedArr,
          getCorrectAnswersForCategory(q, cat)
        );
        if (isRight) {
          catMap[cat].correct++;
        }
        catMap[cat].earned += earnedFrac * marks;
      });
    });

    const pct = r.totalMarks > 0 ? Math.round((r.score / r.totalMarks) * 100) : 0;
    return { ...r, catMap, pct };
  });

  const filtered = enriched.filter(r => {
    const q = search.toLowerCase();
    return [r.CandidateName, r.CandidateEmail, r.userName, r.userEmail, r.project, r.designation]
      .join(" ").toLowerCase().includes(q);
  });

  const now = new Date();
  const isInWindow = (() => {
    if (suite?.startDate && now < new Date(suite.startDate)) return false;
    if (suite?.endDate   && now > new Date(suite.endDate))   return false;
    return true;
  })();

  if (loading) return (
    <div style={{ minHeight:"100vh", background: BG, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI', sans-serif", color:"#aaa" }}>
      Loading results…
    </div>
  );

  if (error) return (
    <div style={{ minHeight:"100vh", background: BG, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI', sans-serif" }}>
      <div style={{ background: WHITE, borderRadius:"16px", padding:"32px", textAlign:"center" }}>
        <p style={{ color:"#dc2626" }}>{error}</p>
        <button onClick={() => navigate("/dashboard")} style={{ padding:"10px 24px", background: GREEN, color: WHITE, border:"none", borderRadius:"10px", fontSize:"14px", fontWeight:"600", cursor:"pointer" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background: BG, fontFamily:"'Segoe UI', sans-serif" }}>

      {/* Top bar */}
      <div style={{ padding:"16px 28px 0", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"12px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
          <div style={{ width:"52px", height:"52px", borderRadius:"50%", background: WHITE, border:"0.5px solid rgba(0,0,0,0.1)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="Logo" style={{ width:"48px", height:"48px", objectFit:"contain" }} onError={e => { e.target.style.display="none"; }} />
          </div>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap" }}>
              <div style={{ fontSize:"20px", fontWeight:"700", color: GREEN_DARK }}>{suite?.name} — Results</div>
              <span style={{
                padding:"3px 12px", borderRadius:"999px", fontSize:"12px", fontWeight:"700",
                background: suiteStatus === "active" ? "#dcfce7" : "#fee2e2",
                color:      suiteStatus === "active" ? "#166534" : "#991b1b",
              }}>
                {suiteStatus === "active" ? "● Active" : "○ Inactive"}
              </span>
              {suite?.startDate || suite?.endDate ? (
                <span style={{
                  padding:"3px 12px", borderRadius:"999px", fontSize:"12px", fontWeight:"600",
                  background: isInWindow ? "#eff6ff" : "#fef3c7",
                  color:      isInWindow ? "#1d4ed8" : "#92400e",
                }}>
                  {isInWindow ? "🕐 Window Open" : "⏸ Outside Window"}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize:"13px", color:"#6B6B5E", marginTop:"2px" }}>
              {results.length} submission{results.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
          <button onClick={handleToggleStatus} style={{
            display:"flex", alignItems:"center", gap:"7px", padding:"10px 18px",
            background: suiteStatus === "active" ? "#fee2e2" : "#dcfce7",
            color:      suiteStatus === "active" ? "#dc2626" : "#166534",
            border:     suiteStatus === "active" ? "1.5px solid #fca5a5" : "1.5px solid #86efac",
            borderRadius:"22px", fontSize:"14px", fontWeight:"600", cursor:"pointer",
          }}>
            {suiteStatus === "active" ? "⏸ Deactivate" : "▶ Activate"}
          </button>
          <button onClick={() => setShowDownloads(v => !v)} disabled={results.length === 0} style={{
            display:"flex", alignItems:"center", gap:"7px", padding:"10px 18px",
            background: showDownloads ? GREEN : WHITE,
            color: showDownloads ? WHITE : GREEN_DARK,
            border:`1.5px solid ${GREEN}`, borderRadius:"22px", fontSize:"14px", fontWeight:"600",
            cursor: results.length === 0 ? "not-allowed" : "pointer",
            opacity: results.length === 0 ? 0.5 : 1,
          }}>
            ⬇ Download Results
          </button>
        </div>
      </div>

      {showDownloads && (
        <div style={{ margin:"16px 28px 0", background: WHITE, borderRadius:"16px", padding:"18px 20px", border:"1px solid #d8e9df", boxShadow:"0 10px 28px rgba(0,0,0,0.05)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"12px", flexWrap:"wrap", marginBottom:"14px" }}>
            <div>
              <div style={{ fontSize:"15px", fontWeight:"800", color: GREEN_DARK }}>Download Results</div>
              <div style={{ fontSize:"12px", color:"#777", marginTop:"2px" }}>Choose summary or descriptive report, then choose PDF or Excel.</div>
            </div>
            {downloading && <span style={{ color: GREEN, fontSize:"12px", fontWeight:"700" }}>Generating...</span>}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:"12px" }}>
            <div style={{ border:"1px solid #e5e7eb", borderRadius:"12px", padding:"14px", background:"#fafcfb" }}>
              <div style={{ fontSize:"13px", fontWeight:"800", color: GREEN_DARK, marginBottom:"4px" }}>Summary Result</div>
              <div style={{ fontSize:"12px", color:"#777", minHeight:"34px" }}>Candidate score, percentage, result status, and category-wise summary.</div>
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginTop:"12px" }}>
                <button onClick={() => handleDownloadPDF("summary")} disabled={downloading} style={{ padding:"9px 14px", borderRadius:"10px", border:"none", background: GREEN, color: WHITE, fontWeight:"700", cursor: downloading ? "not-allowed" : "pointer", opacity: downloading ? 0.65 : 1 }}>
                  {dlType === "summary-pdf" ? "Generating..." : "PDF"}
                </button>
                <button onClick={() => handleDownloadExcel("summary")} disabled={downloading} style={{ padding:"9px 14px", borderRadius:"10px", border:`1px solid ${GREEN}`, background: WHITE, color: GREEN_DARK, fontWeight:"700", cursor: downloading ? "not-allowed" : "pointer", opacity: downloading ? 0.65 : 1 }}>
                  {dlType === "summary-excel" ? "Generating..." : "Excel"}
                </button>
              </div>
            </div>
            <div style={{ border:"1px solid #e5e7eb", borderRadius:"12px", padding:"14px", background:"#fafcfb" }}>
              <div style={{ fontSize:"13px", fontWeight:"800", color: GREEN_DARK, marginBottom:"4px" }}>Descriptive Result</div>
              <div style={{ fontSize:"12px", color:"#777", minHeight:"34px" }}>Detailed category performance plus question-wise selected and correct answers.</div>
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginTop:"12px" }}>
                <button onClick={() => handleDownloadPDF("descriptive")} disabled={downloading} style={{ padding:"9px 14px", borderRadius:"10px", border:"none", background: GREEN, color: WHITE, fontWeight:"700", cursor: downloading ? "not-allowed" : "pointer", opacity: downloading ? 0.65 : 1 }}>
                  {dlType === "descriptive-pdf" ? "Generating..." : "PDF"}
                </button>
                <button onClick={() => handleDownloadExcel("descriptive")} disabled={downloading} style={{ padding:"9px 14px", borderRadius:"10px", border:`1px solid ${GREEN}`, background: WHITE, color: GREEN_DARK, fontWeight:"700", cursor: downloading ? "not-allowed" : "pointer", opacity: downloading ? 0.65 : 1 }}>
                  {dlType === "descriptive-excel" ? "Generating..." : "Excel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div style={{ padding:"12px 28px", display:"flex", gap:"16px", alignItems:"center", borderBottom:"0.5px solid rgba(0,0,0,0.09)", marginTop:"12px" }}>
        <span onClick={() => navigate(`/admin/test-suites/${suiteId}`)} style={{ fontSize:"14px", color:"#4A7A5C", fontWeight:"500", cursor:"pointer" }}>← Back to suite</span>
        <span onClick={() => { localStorage.removeItem("token"); navigate("/"); }} style={{ fontSize:"14px", color:"#C0392B", fontWeight:"500", cursor:"pointer", marginLeft:"auto" }}>Logout</span>
      </div>

      {/* Content */}
      <div style={{ padding:"24px 28px", overflowX:"auto" }}>
        {results.length > 0 && (
          <div style={{ marginBottom:"16px" }}>
            <input
              type="text"
              placeholder="🔍  Search by name, email, project, department…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width:"100%", padding:"12px 18px", borderRadius:"14px", border:"1.5px solid #ddd", fontSize:"14px", background: WHITE, outline:"none", boxSizing:"border-box" }}
            />
            {search && (
              <div style={{ fontSize:"12px", color:"#888", marginTop:"6px", paddingLeft:"4px" }}>
                Showing {filtered.length} of {results.length} result{results.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}

        {filtered.length === 0 && results.length > 0 ? (
          <div style={{ background: WHITE, borderRadius:"16px", border:"0.5px solid rgba(0,0,0,0.08)", padding:"32px", textAlign:"center" }}>
            <p style={{ color:"#A0A098", fontSize:"15px", margin:0 }}>No results match "{search}"</p>
          </div>
        ) : results.length === 0 ? (
          <div style={{ background: WHITE, borderRadius:"16px", border:"0.5px solid rgba(0,0,0,0.08)", padding:"48px 28px", textAlign:"center" }}>
            <div style={{ fontSize:"32px", marginBottom:"10px" }}>📭</div>
            <p style={{ color:"#A0A098", fontSize:"15px", margin:0 }}>No submissions yet for this test suite.</p>
          </div>
        ) : (
          <div style={{ background: WHITE, borderRadius:"16px", border:"0.5px solid rgba(0,0,0,0.08)", overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }}>
              <thead>
                <tr style={{ background: GREEN_DARK }}>
                  {["#", "Candidate", "Email", "Project", "Department", "Score", "%", "Result", ...allCats].map((h, i) => (
                    <th key={i} style={{ padding:"12px 14px", color: WHITE, fontWeight:"700", textAlign: i >= 5 ? "center" : "left", whiteSpace:"nowrap", fontSize:"12px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const status = r.pct >= 50 ? "Pass" : "Fail";
                  return (
                    <tr key={r._id} style={{ borderBottom:"1px solid #f0f0ea", background: i % 2 === 0 ? WHITE : "#fafaf8" }}>
                      <td style={{ padding:"12px 14px", color:"#aaa", textAlign:"center" }}>{i + 1}</td>
                      <td style={{ padding:"12px 14px", fontWeight:"600", color: GREEN_DARK }}>{r.CandidateName || r.userName || "—"}</td>
                      <td style={{ padding:"12px 14px", color:"#888" }}>{r.CandidateEmail || r.userEmail || "—"}</td>
                      <td style={{ padding:"12px 14px", color:"#555" }}>
                        {r.project ? (
                          <span style={{ background:"#eff6ff", color:"#1d4ed8", padding:"2px 10px", borderRadius:"999px", fontSize:"12px", fontWeight:"600" }}>
                            {r.project}
                          </span>
                        ) : <span style={{ color:"#ccc" }}>—</span>}
                      </td>
                      <td style={{ padding:"12px 14px", color:"#555", fontSize:"12px" }}>{r.designation || <span style={{ color:"#ccc" }}>—</span>}</td>
                      <td style={{ padding:"12px 14px", textAlign:"center", fontWeight:"600" }}>{r.score}/{r.totalMarks}</td>
                      <td style={{ padding:"12px 14px", textAlign:"center", fontWeight:"700", color: pctColor(r.pct) }}>{r.pct}%</td>
                      <td style={{ padding:"12px 14px", textAlign:"center" }}>
                        <span style={{ padding:"3px 12px", borderRadius:"999px", fontSize:"12px", fontWeight:"600", ...STATUS_COLOR[status] }}>
                          {status}
                        </span>
                      </td>
                      {/* ✅ FIXED: category columns now correctly use allCats */}
                      {allCats.map(cat => {
                        const s = r.catMap[cat] || { correct: 0, total: 0, marks: 0, earned: 0 };
                        const p = s.marks > 0 ? Math.round((s.earned / s.marks) * 100) : 0;
                        const grade      = p >= 70 ? "High" : p >= 40 ? "Moderate" : "Low";
                        const gradeColor = p >= 70 ? "#166534" : p >= 40 ? "#92400e" : "#dc2626";
                        const gradeBg    = p >= 70 ? "#dcfce7"  : p >= 40 ? "#fef3c7"  : "#fee2e2";
                        return (
                          <td key={cat} style={{ padding:"12px 14px", textAlign:"center" }}>
                            <div style={{ fontWeight:"700", color: pctColor(p), fontSize:"13px" }}>{p}%</div>
                            <div style={{ fontSize:"11px", color:"#aaa" }}>{s.correct}/{s.total}</div>
                            <span style={{ display:"inline-block", marginTop:"3px", padding:"2px 8px", borderRadius:"999px", fontSize:"10px", fontWeight:"700", background: gradeBg, color: gradeColor }}>
                              {grade}
                            </span>
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
