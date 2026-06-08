// src/pages/AdminSuiteResults.jsx
// Route: /admin/results?suite=SUITE_ID
import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { downloadResultsPDF, downloadResultsExcel } from "../utils/downloadResults";

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

// ══════════════════════════════════════════════════════════════
//  IMPORT MODAL  (Excel or PDF)
// ══════════════════════════════════════════════════════════════
function ImportModal({ suiteId, onClose, onImported }) {
  const [tab, setTab]       = useState("excel");
  const [file, setFile]     = useState(null);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const fileRef             = useRef();

  const accept = tab === "excel" ? ".xlsx,.xls" : ".pdf";

  const handleImport = async () => {
    if (!file) return;
    setStatus("loading");
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    const token    = localStorage.getItem("token");
    const endpoint = tab === "excel"
      ? `${API}/api/test-suites/${suiteId}/import-excel`
      : `${API}/api/test-suites/${suiteId}/import-pdf`;
    try {
      const res = await axios.post(endpoint, formData, {
        headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` },
      });
      setResult(res.data);
      setStatus("done");
      onImported(res.data.imported);
    } catch (err) {
      setResult({ message: err.response?.data?.message || "Import failed." });
      setStatus("error");
    }
  };

  const downloadTemplate = () => {
    import("xlsx").then(XLSX => {
      const headers = ["questionText","option1","option2","option3","option4","correctAnswers","explanation","marks","category","language"];
      const example = ["What is 2+2?","3","4","5","6","1","4 is correct","1","Math","en"];
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);
      ws["!cols"] = headers.map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Questions");
      XLSX.writeFile(wb, "question_import_template.xlsx");
    });
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
      <div style={{ background: WHITE, borderRadius:"20px", padding:"28px", width:"100%", maxWidth:"480px", margin:"0 16px", boxShadow:"0 20px 60px rgba(0,0,0,0.18)" }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
          <h2 style={{ fontSize:"17px", fontWeight:"700", color: GREEN_DARK, margin:0 }}>Import Questions</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:"20px", cursor:"pointer", color:"#999", lineHeight:1 }}>×</button>
        </div>

        <div style={{ display:"flex", gap:"8px", marginBottom:"20px", background:"#f4f1ec", borderRadius:"12px", padding:"4px" }}>
          {["excel","pdf"].map(t => (
            <button key={t} onClick={() => { setTab(t); setFile(null); setStatus("idle"); setResult(null); }} style={{
              flex:1, padding:"9px", borderRadius:"10px", border:"none", cursor:"pointer", fontWeight:"700", fontSize:"13px",
              background: tab === t ? GREEN : "transparent",
              color: tab === t ? WHITE : "#777",
              transition:"all 0.15s",
            }}>
              {t === "excel" ? "📊 Excel (.xlsx)" : "📄 PDF"}
            </button>
          ))}
        </div>

        <div style={{ background:"#f8f6f2", borderRadius:"12px", padding:"12px 14px", marginBottom:"16px", fontSize:"12px", color:"#666", lineHeight:"1.6" }}>
          {tab === "excel" ? (
            <>
              <strong style={{ color: GREEN_DARK }}>Excel format:</strong> One question per row with columns:<br/>
              <code style={{ fontSize:"11px", color:"#444" }}>questionText, option1–4, correctAnswers (0-based index e.g. "0"), explanation, marks, category, language</code>
              <br/>
              <button onClick={downloadTemplate} style={{ marginTop:"8px", background:"none", border:`1px solid ${GREEN}`, color: GREEN, borderRadius:"8px", padding:"4px 12px", fontSize:"11px", cursor:"pointer", fontWeight:"600" }}>
                ⬇ Download Template
              </button>
            </>
          ) : (
            <>
              <strong style={{ color: GREEN_DARK }}>PDF format:</strong> One question block per blank-line gap:<br/>
              <code style={{ fontSize:"11px", color:"#444", whiteSpace:"pre-wrap" }}>
{`Q1. Question text?
A) Option one
B) Option two
C) Option three
D) Option four
Answer: A
Category: Science
Marks: 2`}
              </code>
            </>
          )}
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border:`2px dashed ${file ? GREEN : "#ccc"}`, borderRadius:"12px", padding:"20px",
            textAlign:"center", cursor:"pointer", marginBottom:"16px",
            background: file ? "#f0faf5" : "#fafaf8", transition:"all 0.15s",
          }}
        >
          <input ref={fileRef} type="file" accept={accept} style={{ display:"none" }} onChange={e => { setFile(e.target.files[0]); setStatus("idle"); setResult(null); }} />
          {file ? (
            <div>
              <div style={{ fontSize:"24px", marginBottom:"6px" }}>{tab === "excel" ? "📊" : "📄"}</div>
              <div style={{ fontWeight:"700", color: GREEN_DARK, fontSize:"14px" }}>{file.name}</div>
              <div style={{ color:"#aaa", fontSize:"12px" }}>{(file.size / 1024).toFixed(1)} KB</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:"28px", marginBottom:"8px" }}>📁</div>
              <div style={{ color:"#888", fontSize:"13px" }}>Click to choose {tab === "excel" ? "an Excel" : "a PDF"} file</div>
            </div>
          )}
        </div>

        {result && (
          <div style={{
            padding:"10px 14px", borderRadius:"10px", fontSize:"13px", marginBottom:"14px",
            background: status === "done" ? "#dcfce7" : "#fee2e2",
            color: status === "done" ? "#166534" : "#dc2626",
          }}>
            <strong>{result.message}</strong>
            {result.imported > 0 && <span> ({result.imported} imported{result.skipped > 0 ? `, ${result.skipped} skipped` : ""})</span>}
            {result.errors?.length > 0 && (
              <ul style={{ margin:"6px 0 0", paddingLeft:"16px", fontSize:"11px" }}>
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {result.errors.length > 5 && <li>…and {result.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
        )}

        <div style={{ display:"flex", gap:"10px", justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px", fontSize:"14px", borderRadius:"22px", border:"1px solid #ddd", background: WHITE, cursor:"pointer", fontWeight:"600", color:"#555" }}>
            {status === "done" ? "Close" : "Cancel"}
          </button>
          {status !== "done" && (
            <button
              onClick={handleImport}
              disabled={!file || status === "loading"}
              style={{ padding:"10px 22px", fontSize:"14px", borderRadius:"22px", border:"none", background: GREEN, color: WHITE, cursor: !file || status === "loading" ? "not-allowed" : "pointer", fontWeight:"600", opacity: !file || status === "loading" ? 0.6 : 1 }}
            >
              {status === "loading" ? "Importing…" : "Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function AdminSuiteResults() {
  const [searchParams]              = useSearchParams();
  const navigate                    = useNavigate();
  const suiteId                     = searchParams.get("suite");

  const [suite, setSuite]           = useState(null);
  const [questions, setQuestions]   = useState([]);
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [dlType, setDlType]         = useState("");
  const [error, setError]           = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  // ── Feature 12: Search/filter ────────────────────────────────
  const [search, setSearch]         = useState("");

  // ── Feature 4: Active/Inactive toggle (local state mirrors suite) ──
  const [suiteStatus, setSuiteStatus] = useState(null);

  // ── Feature 9: Date window edit state ──────────────────────
  const [editingDates, setEditingDates] = useState(false);
  const [startDate, setStartDate]   = useState("");
  const [endDate, setEndDate]       = useState("");
  const [savingDates, setSavingDates] = useState(false);

  const allCats = [...new Set(questions.map(q => q.category || "Uncategorized"))];

  useEffect(() => {
    if (!suiteId) { setError("No suite ID provided."); setLoading(false); return; }
    const fetchAll = async () => {
      try {
        const token   = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };
        const [suiteRes, qRes, rRes] = await Promise.all([
          axios.get(`${API}/api/test-suites/${suiteId}`, { headers }),
          axios.get(`${API}/api/test-suites/${suiteId}/questions`, { headers }),
          axios.get(`${API}/api/results/suite/${suiteId}`, { headers }),
        ]);
        setSuite(suiteRes.data);
        setSuiteStatus(suiteRes.data.status || "active");
        // Pre-fill date fields
        setStartDate(suiteRes.data.startDate ? suiteRes.data.startDate.slice(0, 16) : "");
        setEndDate(suiteRes.data.endDate   ? suiteRes.data.endDate.slice(0, 16)   : "");
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

  // ── Feature 4: Toggle active/inactive ───────────────────────
  const handleToggleStatus = async () => {
    try {
      const token = localStorage.getItem("token");
      const res   = await axios.put(
        `${API}/api/test-suites/${suiteId}/toggle-status`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuiteStatus(res.data.status);
      setSuite(prev => ({ ...prev, status: res.data.status }));
    } catch (err) {
      console.error(err);
      alert("Failed to toggle test status.");
    }
  };

  // ── Feature 14: Copy direct test link ───────────────────────
  const handleCopyLink = () => {
    const url = `${window.location.origin}/test/${suiteId}`;
    navigator.clipboard.writeText(url).then(() => {
      alert("Test link copied! Share this with candidates:\n\n" + url);
    });
  };

  // ── Feature 9: Save date window ─────────────────────────────
  const handleSaveDates = async () => {
    setSavingDates(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/api/test-suites/${suiteId}/dates`,
        { startDate: startDate || null, endDate: endDate || null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuite(prev => ({ ...prev, startDate, endDate }));
      setEditingDates(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save dates.");
    } finally {
      setSavingDates(false);
    }
  };

  const handleDownloadPDF = async () => {
    setDownloading(true); setDlType("pdf");
    try { await downloadResultsPDF(suite, questions, results); }
    catch (err) { console.error(err); alert("Failed to generate PDF."); }
    finally { setDownloading(false); setDlType(""); }
  };

  const handleDownloadExcel = () => {
    setDownloading(true); setDlType("excel");
    try { downloadResultsExcel(suite, questions, results); }
    catch (err) { console.error(err); alert("Failed to generate Excel."); }
    finally { setDownloading(false); setDlType(""); }
  };

  // Per-result stats
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

  // ── Feature 12: Filter enriched results by search ────────────
  const filtered = enriched.filter(r => {
    const q = search.toLowerCase();
    return [r.CandidateName, r.CandidateEmail, r.userName, r.userEmail, r.project, r.designation]
      .join(" ").toLowerCase().includes(q);
  });

  // ── Feature 9: Check if test is currently within window ─────
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

      {/* ── Top bar ── */}
      <div style={{ padding:"16px 28px 0", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"12px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
          <div style={{ width:"52px", height:"52px", borderRadius:"50%", background: WHITE, border:"0.5px solid rgba(0,0,0,0.1)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="Logo" style={{ width:"48px", height:"48px", objectFit:"contain" }} onError={e => { e.target.style.display="none"; }} />
          </div>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap" }}>
              <div style={{ fontSize:"20px", fontWeight:"700", color: GREEN_DARK }}>{suite?.name} — Results</div>
              {/* ── Feature 4: Status badge ── */}
              <span style={{
                padding:"3px 12px", borderRadius:"999px", fontSize:"12px", fontWeight:"700",
                background: suiteStatus === "active" ? "#dcfce7" : "#fee2e2",
                color:      suiteStatus === "active" ? "#166534" : "#991b1b",
              }}>
                {suiteStatus === "active" ? "● Active" : "○ Inactive"}
              </span>
              {/* ── Feature 9: Window status ── */}
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
              {importedCount > 0 && <span style={{ color: GREEN, marginLeft:"8px" }}>· {importedCount} questions imported</span>}
            </div>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>

          {/* ── Feature 4: Toggle status ── */}
          <button
            onClick={handleToggleStatus}
            style={{
              display:"flex", alignItems:"center", gap:"7px",
              padding:"10px 18px",
              background: suiteStatus === "active" ? "#fee2e2" : "#dcfce7",
              color:      suiteStatus === "active" ? "#dc2626" : "#166534",
              border:     suiteStatus === "active" ? "1.5px solid #fca5a5" : "1.5px solid #86efac",
              borderRadius:"22px", fontSize:"14px", fontWeight:"600", cursor:"pointer",
            }}
          >
            {suiteStatus === "active" ? "⏸ Deactivate" : "▶ Activate"}
          </button>

          {/* ── Feature 9: Date window button ── */}
          <button
            onClick={() => setEditingDates(v => !v)}
            style={{
              display:"flex", alignItems:"center", gap:"7px",
              padding:"10px 18px", background: editingDates ? GREEN : WHITE,
              color: editingDates ? WHITE : GREEN_DARK,
              border:`1.5px solid ${GREEN}`, borderRadius:"22px", fontSize:"14px", fontWeight:"600", cursor:"pointer",
            }}
          >
            📅 {editingDates ? "Hide Dates" : "Set Date Window"}
          </button>

          {/* ── Feature 14: Copy test link ── */}
          <button
            onClick={handleCopyLink}
            style={{
              display:"flex", alignItems:"center", gap:"7px",
              padding:"10px 18px", background: WHITE, color: GREEN_DARK,
              border:`1.5px solid ${GREEN}`, borderRadius:"22px", fontSize:"14px", fontWeight:"600", cursor:"pointer",
            }}
          >
            🔗 Copy Test Link
          </button>

          {/* Import button */}
          <button
            onClick={() => setShowImport(true)}
            style={{
              display:"flex", alignItems:"center", gap:"7px",
              padding:"10px 18px", background: WHITE, color: GREEN_DARK,
              border:`1.5px solid ${GREEN}`, borderRadius:"22px", fontSize:"14px", fontWeight:"600", cursor:"pointer",
            }}
          >
            ⬆ Import Questions
          </button>

          {/* Download Excel */}
          <button
            onClick={handleDownloadExcel}
            disabled={downloading || results.length === 0}
            style={{
              display:"flex", alignItems:"center", gap:"7px",
              padding:"10px 18px", background: downloading && dlType === "excel" ? "#aaa" : "#166534",
              color: WHITE, border:"none", borderRadius:"22px", fontSize:"14px", fontWeight:"600",
              cursor: downloading || results.length === 0 ? "not-allowed" : "pointer",
              opacity: results.length === 0 ? 0.5 : 1,
            }}
          >
            {downloading && dlType === "excel" ? "Generating…" : "📊 Download Excel"}
          </button>

          {/* Download PDF */}
          <button
            onClick={handleDownloadPDF}
            disabled={downloading || results.length === 0}
            style={{
              display:"flex", alignItems:"center", gap:"7px",
              padding:"10px 18px", background: downloading && dlType === "pdf" ? "#aaa" : GREEN,
              color: WHITE, border:"none", borderRadius:"22px", fontSize:"14px", fontWeight:"600",
              cursor: downloading || results.length === 0 ? "not-allowed" : "pointer",
              opacity: results.length === 0 ? 0.5 : 1,
            }}
          >
            {downloading && dlType === "pdf" ? "Generating…" : "📄 Download PDF"}
          </button>

        </div>
      </div>

      {/* ── Feature 9: Date window editor (inline panel) ── */}
      {editingDates && (
        <div style={{ margin:"16px 28px 0", background: WHITE, borderRadius:"16px", padding:"20px 24px", border:`1.5px solid ${GREEN}`, display:"flex", flexWrap:"wrap", gap:"20px", alignItems:"flex-end" }}>
          <div>
            <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color: GREEN_DARK, marginBottom:"6px" }}>
              Start Date &amp; Time
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ padding:"9px 14px", borderRadius:"10px", border:"1.5px solid #ddd", fontSize:"14px", color:"#333", outline:"none" }}
            />
          </div>
          <div>
            <label style={{ display:"block", fontSize:"12px", fontWeight:"700", color: GREEN_DARK, marginBottom:"6px" }}>
              End Date &amp; Time
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ padding:"9px 14px", borderRadius:"10px", border:"1.5px solid #ddd", fontSize:"14px", color:"#333", outline:"none" }}
            />
          </div>
          <div style={{ display:"flex", gap:"10px" }}>
            <button
              onClick={() => { setStartDate(""); setEndDate(""); }}
              style={{ padding:"9px 16px", borderRadius:"10px", border:"1px solid #ddd", background:"#f9f9f9", color:"#888", fontWeight:"600", fontSize:"13px", cursor:"pointer" }}
            >
              Clear
            </button>
            <button
              onClick={handleSaveDates}
              disabled={savingDates}
              style={{ padding:"9px 20px", borderRadius:"10px", border:"none", background: GREEN, color: WHITE, fontWeight:"700", fontSize:"13px", cursor: savingDates ? "not-allowed" : "pointer", opacity: savingDates ? 0.7 : 1 }}
            >
              {savingDates ? "Saving…" : "Save Dates"}
            </button>
          </div>
          <div style={{ fontSize:"12px", color:"#888", width:"100%" }}>
            {startDate && <span>Opens: {new Date(startDate).toLocaleString()} &nbsp;·&nbsp; </span>}
            {endDate   && <span>Closes: {new Date(endDate).toLocaleString()}</span>}
            {!startDate && !endDate && <span>No date restriction — test is always available when active.</span>}
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <div style={{ padding:"12px 28px", display:"flex", gap:"16px", alignItems:"center", borderBottom:"0.5px solid rgba(0,0,0,0.09)", marginTop:"12px" }}>
        <span onClick={() => navigate(`/admin/test-suites/${suiteId}`)} style={{ fontSize:"14px", color:"#4A7A5C", fontWeight:"500", cursor:"pointer" }}>
          ← Back to suite
        </span>
        <span onClick={() => { localStorage.removeItem("token"); navigate("/"); }} style={{ fontSize:"14px", color:"#C0392B", fontWeight:"500", cursor:"pointer", marginLeft:"auto" }}>
          Logout
        </span>
      </div>

      {/* ── Content ── */}
      <div style={{ padding:"24px 28px", overflowX:"auto" }}>

        {/* ── Feature 12: Search bar ── */}
        {results.length > 0 && (
          <div style={{ marginBottom:"16px" }}>
            <input
              type="text"
              placeholder="🔍  Search by name, email, project, designation…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width:"100%", padding:"12px 18px",
                borderRadius:"14px", border:"1.5px solid #ddd",
                fontSize:"14px", background: WHITE, outline:"none",
                boxSizing:"border-box",
              }}
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
                  {/* ── Feature 11: Added Project + Designation columns ── */}
                  {["#", "Candidate", "Email", "Project", "Designation", "Score", "%", "Result", ...allCats].map((h, i) => (
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
                      {/* ── Feature 11: Project + Designation ── */}
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

      {/* ── Import Modal ── */}
      {showImport && (
        <ImportModal
          suiteId={suiteId}
          onClose={() => setShowImport(false)}
          onImported={count => { setImportedCount(prev => prev + count); setShowImport(false); }}
        />
      )}

    </div>
  );
}