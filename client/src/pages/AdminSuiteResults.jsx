// src/pages/AdminSuiteResults.jsx
import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { downloadResultsPDF, downloadResultsExcel } from "../utils/downloadResults";
import { canAdmin, clearAuthSession, getAuthHeaders, getCurrentUser } from "../utils/auth";
import { sendCertificateEmail } from "../utils/certificate";

const API = import.meta.env.VITE_API_URL || "";

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

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }) : "-";
}

function validTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function toDateTimeLocalValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getPresetRange(preset) {
  const end = new Date();
  const start = new Date(end);
  if (preset === "last-day") start.setDate(start.getDate() - 1);
  else if (preset === "last-week") start.setDate(start.getDate() - 7);
  else if (preset === "last-month") start.setMonth(start.getMonth() - 1);
  else if (preset === "three-months") start.setMonth(start.getMonth() - 3);
  else if (preset === "last-year") start.setFullYear(start.getFullYear() - 1);
  else return { from: "", to: "" };
  return { from: toDateTimeLocalValue(start), to: toDateTimeLocalValue(end) };
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

function itemId(value) {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
}

function answerQuestion(answer) {
  return answer?.questionId && typeof answer.questionId === "object" ? answer.questionId : null;
}

function answerQuestionId(answer) {
  return itemId(answer?.questionId || answer?.question);
}

function questionsById(items) {
  return new Map((items || []).map(question => [itemId(question), question]));
}

function findAnswerQuestion(answer, byId) {
  const populated = answerQuestion(answer);
  if (populated) return populated;
  return byId.get(answerQuestionId(answer)) || null;
}

function getCorrectAnswersForCategory(q, cat) {
  const fallback = uniqueIndexes(Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]);
  const map = getCategoryAnswerMap(q);
  const categoryAnswers = uniqueIndexes(map[cat]);
  return categoryAnswers.length > 0 ? categoryAnswers : fallback;
}

function scoreSelected(selectedArr, correctArr) {
  if (correctArr.length === 0) return { earnedFrac: 0, isRight: false };
  const selectedIndexes = uniqueIndexes(selectedArr);
  const hits = selectedIndexes.filter(i => correctArr.includes(i)).length;
  const wrongs = selectedIndexes.filter(i => !correctArr.includes(i)).length;
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
  const [attemptPreset, setAttemptPreset] = useState("");
  const [attemptFrom, setAttemptFrom] = useState("");
  const [attemptTo, setAttemptTo]   = useState("");
  const [suiteStatus, setSuiteStatus] = useState(null);
  const currentUser = getCurrentUser();
  const canDownloadReports = canAdmin("canDownloadReports", currentUser);
  const canSendCertificates = canAdmin("canBulkMail", currentUser);

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

  const handleDownloadPDF = async (reportType) => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    setDownloading(true); setDlType(`${reportType}-pdf`);
    try { await downloadResultsPDF(suite, questions, results, { reportType }); }
    catch (err) { console.error(err); alert("Failed to generate PDF."); }
    finally { setDownloading(false); setDlType(""); }
  };

  const handleDownloadExcel = (reportType) => {
    if (!canDownloadReports) return alert("Download permission is disabled for your account.");
    setDownloading(true); setDlType(`${reportType}-excel`);
    try { downloadResultsExcel(suite, questions, results, { reportType }); }
    catch (err) { console.error(err); alert("Failed to generate Excel."); }
    finally { setDownloading(false); setDlType(""); }
  };

  const handleEmailCertificate = async (result, language) => {
    if (!canSendCertificates) return alert("Certificate email permission is disabled for your account.");
    const passed = typeof result.passed === "boolean" ? result.passed : result.pct >= 50;
    if (!passed) return alert("Certificate can be sent only for passed candidates.");
    try {
      await sendCertificateEmail(result, suite, language);
    } catch (err) {
      alert(err.message || "Unable to prepare certificate email.");
    }
  };

  // ✅ FIXED: Per-result stats now correctly handles multi-category questions
  const enriched = results.map(r => {
    const byId = questionsById(questions);
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
      const q = findAnswerQuestion(ans, byId);
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

  const attemptFromTime = validTime(attemptFrom);
  const attemptToTime = validTime(attemptTo);
  const filtersActive = Boolean(search || attemptFrom || attemptTo);
  const handleAttemptPresetChange = (preset) => {
    setAttemptPreset(preset);
    const range = getPresetRange(preset);
    setAttemptFrom(range.from);
    setAttemptTo(range.to);
  };

  const filtered = enriched.filter(r => {
    const q = search.trim().toLowerCase();
    const matchesSearch = [
      r.CandidateName,
      r.CandidateEmail,
      r.userName,
      r.userEmail,
      r.project,
      r.designation,
      formatDateTime(r.submittedAt),
    ].join(" ").toLowerCase().includes(q);
    if (!matchesSearch) return false;

    const submittedTime = validTime(r.submittedAt);
    if (attemptFromTime !== null && (submittedTime === null || submittedTime < attemptFromTime)) return false;
    if (attemptToTime !== null && (submittedTime === null || submittedTime > attemptToTime)) return false;
    return true;
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
    <div className="suite-results-page" style={{ minHeight:"100vh", background: BG, fontFamily:"'Segoe UI', sans-serif" }}>

      {/* Top bar */}
      <div className="suite-results-topbar" style={{ padding:"16px 28px 0", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"12px" }}>
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
        <div className="suite-results-actions" style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
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
        <div className="suite-results-downloads" style={{ margin:"16px 28px 0", background: WHITE, borderRadius:"16px", padding:"18px 20px", border:"1px solid #d8e9df", boxShadow:"0 10px 28px rgba(0,0,0,0.05)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"12px", flexWrap:"wrap", marginBottom:"14px" }}>
            <div>
              <div style={{ fontSize:"15px", fontWeight:"800", color: GREEN_DARK }}>Download Results</div>
              <div style={{ fontSize:"12px", color:"#777", marginTop:"2px" }}>Choose summary or descriptive report, then choose PDF or Excel.</div>
            </div>
            {downloading && <span style={{ color: GREEN, fontSize:"12px", fontWeight:"700" }}>Generating...</span>}
            {!canDownloadReports && <span style={{ color:"#991b1b", fontSize:"12px", fontWeight:"700" }}>Download disabled</span>}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:"12px" }}>
            <div style={{ border:"1px solid #e5e7eb", borderRadius:"12px", padding:"14px", background:"#fafcfb" }}>
              <div style={{ fontSize:"13px", fontWeight:"800", color: GREEN_DARK, marginBottom:"4px" }}>Summary Result</div>
              <div style={{ fontSize:"12px", color:"#777", minHeight:"34px" }}>Candidate score, percentage, result status, and category-wise summary.</div>
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginTop:"12px" }}>
                <button onClick={() => handleDownloadPDF("summary")} disabled={downloading || !canDownloadReports} style={{ padding:"9px 14px", borderRadius:"10px", border:"none", background: GREEN, color: WHITE, fontWeight:"700", cursor: downloading || !canDownloadReports ? "not-allowed" : "pointer", opacity: downloading || !canDownloadReports ? 0.65 : 1 }}>
                  {dlType === "summary-pdf" ? "Generating..." : "PDF"}
                </button>
                <button onClick={() => handleDownloadExcel("summary")} disabled={downloading || !canDownloadReports} style={{ padding:"9px 14px", borderRadius:"10px", border:`1px solid ${GREEN}`, background: WHITE, color: GREEN_DARK, fontWeight:"700", cursor: downloading || !canDownloadReports ? "not-allowed" : "pointer", opacity: downloading || !canDownloadReports ? 0.65 : 1 }}>
                  {dlType === "summary-excel" ? "Generating..." : "Excel"}
                </button>
              </div>
            </div>
            <div style={{ border:"1px solid #e5e7eb", borderRadius:"12px", padding:"14px", background:"#fafcfb" }}>
              <div style={{ fontSize:"13px", fontWeight:"800", color: GREEN_DARK, marginBottom:"4px" }}>Descriptive Result</div>
              <div style={{ fontSize:"12px", color:"#777", minHeight:"34px" }}>Detailed category performance plus question-wise selected and correct answers.</div>
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginTop:"12px" }}>
                <button onClick={() => handleDownloadPDF("descriptive")} disabled={downloading || !canDownloadReports} style={{ padding:"9px 14px", borderRadius:"10px", border:"none", background: GREEN, color: WHITE, fontWeight:"700", cursor: downloading || !canDownloadReports ? "not-allowed" : "pointer", opacity: downloading || !canDownloadReports ? 0.65 : 1 }}>
                  {dlType === "descriptive-pdf" ? "Generating..." : "PDF"}
                </button>
                <button onClick={() => handleDownloadExcel("descriptive")} disabled={downloading || !canDownloadReports} style={{ padding:"9px 14px", borderRadius:"10px", border:`1px solid ${GREEN}`, background: WHITE, color: GREEN_DARK, fontWeight:"700", cursor: downloading || !canDownloadReports ? "not-allowed" : "pointer", opacity: downloading || !canDownloadReports ? 0.65 : 1 }}>
                  {dlType === "descriptive-excel" ? "Generating..." : "Excel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="suite-results-nav" style={{ padding:"12px 28px", display:"flex", gap:"16px", alignItems:"center", borderBottom:"0.5px solid rgba(0,0,0,0.09)", marginTop:"12px" }}>
        <span onClick={() => navigate(`/admin/test-suites/${suiteId}`)} style={{ fontSize:"14px", color:"#4A7A5C", fontWeight:"500", cursor:"pointer" }}>← Back to suite</span>
        <span onClick={() => { clearAuthSession(); navigate("/"); }} style={{ fontSize:"14px", color:"#C0392B", fontWeight:"500", cursor:"pointer", marginLeft:"auto" }}>Logout</span>
      </div>

      {/* Content */}
      <div className="suite-results-content" style={{ padding:"24px 28px", overflowX:"auto" }}>
        {results.length > 0 && (
          <div style={{ marginBottom:"16px" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"10px", alignItems:"end" }}>
              <input
                type="text"
                placeholder="🔍  Search by name, email, project, department…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex:"1 1 320px", minWidth:"220px", padding:"12px 18px", borderRadius:"14px", border:"1.5px solid #ddd", fontSize:"14px", background: WHITE, outline:"none", boxSizing:"border-box" }}
              />
              <label style={{ flex:"0 1 210px", display:"grid", gap:"5px", fontSize:"11px", fontWeight:"800", color:"#6B6B5E", letterSpacing:"0.04em", textTransform:"uppercase" }}>
                Period
                <select
                  value={attemptPreset}
                  onChange={e => handleAttemptPresetChange(e.target.value)}
                  style={{ width:"100%", padding:"12px 14px", borderRadius:"14px", border:"1.5px solid #ddd", fontSize:"14px", background: WHITE, outline:"none", boxSizing:"border-box", color:"#2f3a34" }}
                >
                  <option value="">All time</option>
                  <option value="last-day">Last day</option>
                  <option value="last-week">Last week</option>
                  <option value="last-month">Last month</option>
                  <option value="three-months">Last 3 months</option>
                  <option value="last-year">Last year</option>
                  {attemptPreset === "custom" && <option value="custom">Custom range</option>}
                </select>
              </label>
              <label style={{ flex:"0 1 220px", display:"grid", gap:"5px", fontSize:"11px", fontWeight:"800", color:"#6B6B5E", letterSpacing:"0.04em", textTransform:"uppercase" }}>
                From
                <input
                  type="datetime-local"
                  value={attemptFrom}
                  onChange={e => {
                    setAttemptPreset("custom");
                    setAttemptFrom(e.target.value);
                  }}
                  style={{ width:"100%", padding:"12px 14px", borderRadius:"14px", border:"1.5px solid #ddd", fontSize:"14px", background: WHITE, outline:"none", boxSizing:"border-box", color:"#2f3a34" }}
                />
              </label>
              <label style={{ flex:"0 1 220px", display:"grid", gap:"5px", fontSize:"11px", fontWeight:"800", color:"#6B6B5E", letterSpacing:"0.04em", textTransform:"uppercase" }}>
                To
                <input
                  type="datetime-local"
                  value={attemptTo}
                  onChange={e => {
                    setAttemptPreset("custom");
                    setAttemptTo(e.target.value);
                  }}
                  style={{ width:"100%", padding:"12px 14px", borderRadius:"14px", border:"1.5px solid #ddd", fontSize:"14px", background: WHITE, outline:"none", boxSizing:"border-box", color:"#2f3a34" }}
                />
              </label>
              {filtersActive && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setAttemptPreset("");
                    setAttemptFrom("");
                    setAttemptTo("");
                  }}
                  style={{ flex:"0 0 auto", padding:"12px 18px", borderRadius:"14px", border:"1.5px solid rgba(45,95,63,0.25)", background:"#f8fbf8", color:GREEN, fontSize:"14px", fontWeight:"800", cursor:"pointer" }}
                >
                  Clear
                </button>
              )}
            </div>
            {filtersActive && (
              <div style={{ fontSize:"12px", color:"#888", marginTop:"6px", paddingLeft:"4px" }}>
                Showing {filtered.length} of {results.length} result{results.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}

        {filtered.length === 0 && results.length > 0 ? (
          <div style={{ background: WHITE, borderRadius:"16px", border:"0.5px solid rgba(0,0,0,0.08)", padding:"32px", textAlign:"center" }}>
            <p style={{ color:"#A0A098", fontSize:"15px", margin:0 }}>No results match the selected search or date/time period.</p>
          </div>
        ) : results.length === 0 ? (
          <div style={{ background: WHITE, borderRadius:"16px", border:"0.5px solid rgba(0,0,0,0.08)", padding:"48px 28px", textAlign:"center" }}>
            <div style={{ fontSize:"32px", marginBottom:"10px" }}>📭</div>
            <p style={{ color:"#A0A098", fontSize:"15px", margin:0 }}>No submissions yet for this test suite.</p>
          </div>
        ) : (
          <div className="suite-results-table-card" style={{ background: WHITE, borderRadius:"16px", border:"0.5px solid rgba(0,0,0,0.08)", overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }}>
              <thead>
                <tr style={{ background: GREEN_DARK }}>
                  {["#", "Candidate", "Email", "Project", "Department", "Score", "%", "Result", "Attempted At", "Certificate", ...allCats].map((h, i) => (
                    <th key={i} style={{ padding:"12px 14px", color: WHITE, fontWeight:"700", textAlign: i >= 5 ? "center" : "left", whiteSpace:"nowrap", fontSize:"12px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const passed = typeof r.passed === "boolean" ? r.passed : r.pct >= 50;
                  const status = passed ? "Pass" : "Fail";
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
                      <td style={{ padding:"12px 14px", color:"#666", fontSize:"12px", whiteSpace:"nowrap" }}>{formatDateTime(r.submittedAt)}</td>
                      <td style={{ padding:"12px 14px", textAlign:"center" }}>
                        {passed ? (
                          <div style={{ display:"flex", gap:"6px", justifyContent:"center", flexWrap:"wrap" }}>
                            <button
                              type="button"
                              onClick={() => handleEmailCertificate(r, "english")}
                              disabled={!canSendCertificates}
                              style={{ padding:"7px 9px", borderRadius:"9px", border:`1px solid ${GREEN}`, background: canSendCertificates ? WHITE : "#f3f4f6", color: canSendCertificates ? GREEN_DARK : "#999", fontSize:"11px", fontWeight:"800", cursor: canSendCertificates ? "pointer" : "not-allowed" }}
                            >
                              Email EN
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEmailCertificate(r, "marathi")}
                              disabled={!canSendCertificates}
                              style={{ padding:"7px 9px", borderRadius:"9px", border:`1px solid ${GREEN}`, background: canSendCertificates ? "#f0faf5" : "#f3f4f6", color: canSendCertificates ? GREEN_DARK : "#999", fontSize:"11px", fontWeight:"800", cursor: canSendCertificates ? "pointer" : "not-allowed" }}
                            >
                              Email MR
                            </button>
                          </div>
                        ) : (
                          <span style={{ color:"#aaa", fontSize:"12px" }}>-</span>
                        )}
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
