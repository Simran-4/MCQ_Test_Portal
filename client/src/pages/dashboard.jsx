import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ─── Shared colours ─── */
const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

/* ─── Suite Modal ─── */
function SuiteModal({ suite, onClose, onSave }) {
  const [name, setName]       = useState(suite?.name || "");
  const [description, setDesc]= useState(suite?.description || "");
  const [status, setStatus]   = useState(suite?.status || "draft");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setLoading(true);
    try {
      if (suite) {
        const res = await axios.put(`${API}/api/test-suites/${suite._id}`, { name, description, status });
        onSave(res.data, "edit");
      } else {
        const res = await axios.post(`${API}/api/test-suites`, { name, description, status });
        onSave(res.data, "create");
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
      <div style={{ background: WHITE, borderRadius:"20px", padding:"28px", width:"100%", maxWidth:"420px", margin:"0 16px", boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}>
        <h2 style={{ fontSize:"17px", fontWeight:"700", color: GREEN_DARK, marginBottom:"18px" }}>
          {suite ? "Edit Test Suite" : "New Test Suite"}
        </h2>

        {error && <p style={{ color:"#dc2626", fontSize:"13px", marginBottom:"12px" }}>{error}</p>}

        <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
          <div>
            <label style={{ fontSize:"12px", color:"#666", display:"block", marginBottom:"5px", fontWeight:"600", textTransform:"uppercase", letterSpacing:"0.05em" }}>Name *</label>
            <input style={inputStyle} placeholder="e.g. Botany Unit 1" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:"12px", color:"#666", display:"block", marginBottom:"5px", fontWeight:"600", textTransform:"uppercase", letterSpacing:"0.05em" }}>Description (optional)</label>
            <input style={inputStyle} placeholder="Short description" value={description} onChange={e => setDesc(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:"12px", color:"#666", display:"block", marginBottom:"5px", fontWeight:"600", textTransform:"uppercase", letterSpacing:"0.05em" }}>Status</label>
            <select style={inputStyle} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
        </div>

        <div style={{ display:"flex", gap:"10px", justifyContent:"flex-end", marginTop:"22px" }}>
          <button onClick={onClose} style={{ padding:"10px 20px", fontSize:"14px", borderRadius:"22px", border:"1px solid #ddd", background: WHITE, cursor:"pointer", fontWeight:"600", color:"#555" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} style={{ padding:"10px 22px", fontSize:"14px", borderRadius:"22px", border:"none", background: GREEN, color: WHITE, cursor:"pointer", fontWeight:"600", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Saving…" : suite ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Status badge colours ─── */
const STATUS_COLOR = {
  active:    { background:"#dcfce7", color:"#166534" },
  draft:     { background:"#f3f4f6", color:"#4b5563" },
  scheduled: { background:"#fef3c7", color:"#92400e" },
};

/* ─── Main Dashboard ─── */
export default function Dashboard() {
  const navigate = useNavigate();
  const [suites, setSuites]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSuite, setEditing]= useState(null);

  useEffect(() => { fetchSuites(); }, []);

  const fetchSuites = async () => {
    try {
      const res = await axios.get(`${API}/api/test-suites`);
      setSuites(res.data);
    } catch (err) {
      console.error("Failed to fetch test suites:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleModalSave = (suite, action) => {
    if (action === "create") {
      setSuites(prev => [{ ...suite, questionCount: 0 }, ...prev]);
    } else {
      setSuites(prev => prev.map(s => s._id === suite._id ? { ...s, ...suite } : s));
    }
  };

  const handleDelete = async (suiteId, suiteName, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${suiteName}" and all its questions?`)) return;
    try {
      await axios.delete(`${API}/api/test-suites/${suiteId}`);
      setSuites(prev => prev.filter(s => s._id !== suiteId));
    } catch {
      alert("Failed to delete.");
    }
  };

  return (
    <div style={{ minHeight:"100vh", background: BG, fontFamily:"'Segoe UI', sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{ padding:"16px 28px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
          <div style={{ width:"52px", height:"52px", borderRadius:"50%", background: WHITE, border:"0.5px solid rgba(0,0,0,0.1)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <img
              src="/Logo.png"
              alt="Snehalaya"
              style={{ width:"48px", height:"48px", objectFit:"contain" }}
              onError={e => { e.target.style.display="none"; }}
            />
          </div>
          <div>
            <div style={{ fontSize:"20px", fontWeight:"700", color: GREEN_DARK, lineHeight:1.2 }}>Admin Dashboard</div>
            <div style={{ fontSize:"13px", color:"#6B6B5E", marginTop:"2px" }}>Manage test suites and questions.</div>
          </div>
        </div>

        <button style={{ background: GREEN, color: WHITE, border:"none", borderRadius:"20px", padding:"8px 16px", fontSize:"13px", cursor:"pointer", display:"flex", alignItems:"center", gap:"6px", fontWeight:"500" }}>
          🌐 English ▾
        </button>
      </div>

      {/* ── Nav ── */}
      <div style={{ padding:"12px 28px", display:"flex", gap:"24px", alignItems:"center", borderBottom:"0.5px solid rgba(0,0,0,0.09)", marginTop:"4px" }}>
        <span
          onClick={() => navigate("/view-results")}
          style={{ fontSize:"14px", color:"#4A7A5C", fontWeight:"500", cursor:"pointer", paddingBottom:"2px", borderBottom:"2px solid transparent" }}
          onMouseEnter={e => e.target.style.borderBottomColor = GREEN}
          onMouseLeave={e => e.target.style.borderBottomColor = "transparent"}
        >
          View results
        </span>
        <span
          onClick={() => navigate("/settings")}
          style={{ fontSize:"14px", color:"#4A7A5C", fontWeight:"500", cursor:"pointer", paddingBottom:"2px", borderBottom:"2px solid transparent" }}
          onMouseEnter={e => e.target.style.borderBottomColor = GREEN}
          onMouseLeave={e => e.target.style.borderBottomColor = "transparent"}
        >
          Exam settings
        </span>
        <span
          onClick={() => { localStorage.removeItem("token"); navigate("/"); }}
          style={{ fontSize:"14px", color:"#C0392B", fontWeight:"500", cursor:"pointer", marginLeft:"auto" }}
        >
          Logout
        </span>
      </div>

      {/* ── Content ── */}
      <div style={{ padding:"24px 28px" }}>

        {/* Stat cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:"12px", marginBottom:"24px" }}>
          {[
            { label:"Test Suites",     value: suites.length,                                         sub:"Total suites" },
            { label:"Total Questions", value: suites.reduce((a,s) => a + (s.questionCount ?? 0), 0), sub:"Across all suites" },
            { label:"Active Suites",   value: suites.filter(s => s.status === "active").length,      sub:"Live right now" },
          ].map(card => (
            <div key={card.label} style={{ background: WHITE, borderRadius:"14px", border:"0.5px solid rgba(0,0,0,0.07)", padding:"16px 18px" }}>
              <div style={{ fontSize:"12px", color:"#8A8A7E", marginBottom:"4px" }}>{card.label}</div>
              <div style={{ fontSize:"24px", fontWeight:"700", color: GREEN_DARK }}>{card.value}</div>
              <div style={{ fontSize:"12px", color:"#4A7A5C", marginTop:"2px" }}>{card.sub}</div>
              <div style={{ height:"5px", background:"#E0DDD5", borderRadius:"3px", overflow:"hidden", marginTop:"10px" }}>
                <div style={{ height:"100%", background: GREEN, borderRadius:"3px", width: card.value > 0 ? "60%" : "0%" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Section header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px" }}>
          <span style={{ fontSize:"11px", fontWeight:"700", color:"#8A8A7E", letterSpacing:"0.08em", textTransform:"uppercase" }}>Test Suites</span>
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            style={{ background: GREEN, color: WHITE, border:"none", borderRadius:"22px", padding:"10px 20px", fontSize:"14px", fontWeight:"600", cursor:"pointer", display:"flex", alignItems:"center", gap:"6px" }}
            onMouseEnter={e => e.currentTarget.style.background = GREEN_DARK}
            onMouseLeave={e => e.currentTarget.style.background = GREEN}
          >
            + New test suite
          </button>
        </div>

        {/* Suite list */}
        {loading ? (
          <p style={{ textAlign:"center", color:"#aaa", padding:"48px 0" }}>Loading…</p>

        ) : suites.length === 0 ? (
          <div style={{ background: WHITE, borderRadius:"16px", border:"0.5px solid rgba(0,0,0,0.08)", padding:"48px 28px", display:"flex", flexDirection:"column", alignItems:"center", gap:"10px" }}>
            <div style={{ width:"52px", height:"52px", borderRadius:"50%", background:"#E8F2EC", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"24px" }}>📄</div>
            <p style={{ color:"#A0A098", fontSize:"15px", margin:0 }}>No test suites yet.</p>
            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              style={{ background:"none", border:"none", color: GREEN, fontWeight:"600", fontSize:"14px", cursor:"pointer", textDecoration:"underline" }}
            >
              Create your first test suite →
            </button>
          </div>

        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(210px, 1fr))", gap:"14px" }}>
            {suites.map(suite => (
              <div
                key={suite._id}
                onClick={() => navigate(`/admin/test-suites/${suite._id}`)}
                style={{ background: WHITE, border:"1px solid #e5e7eb", borderRadius:"14px", padding:"18px", cursor:"pointer", transition:"border-color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = GREEN}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#e5e7eb"}
              >
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"8px" }}>
                  <p style={{ fontWeight:"700", fontSize:"15px", color: GREEN_DARK, margin:0, flex:1, marginRight:"8px" }}>{suite.name}</p>
                  <span style={{ fontSize:"11px", padding:"3px 10px", borderRadius:"999px", fontWeight:"600", whiteSpace:"nowrap", ...(STATUS_COLOR[suite.status] || STATUS_COLOR.draft) }}>
                    {suite.status}
                  </span>
                </div>
                {suite.description && <p style={{ fontSize:"12px", color:"#999", margin:"0 0 6px" }}>{suite.description}</p>}
                <p style={{ fontSize:"12px", color:"#aaa", margin:"0 0 14px" }}>
                  {suite.questionCount ?? 0} question{suite.questionCount !== 1 ? "s" : ""}
                </p>
                <div style={{ display:"flex", gap:"8px" }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => navigate(`/admin/test-suites/${suite._id}`)} style={{ flex:1, padding:"8px", fontSize:"13px", fontWeight:"600", background: GREEN, color: WHITE, border:"none", borderRadius:"8px", cursor:"pointer" }}>
                    Open
                  </button>
                  <button onClick={() => { setEditing(suite); setShowModal(true); }} style={{ flex:1, padding:"8px", fontSize:"13px", fontWeight:"600", background: WHITE, color:"#333", border:"1px solid #ddd", borderRadius:"8px", cursor:"pointer" }}>
                    Edit
                  </button>
                  <button onClick={e => handleDelete(suite._id, suite.name, e)} style={{ flex:1, padding:"8px", fontSize:"13px", fontWeight:"600", background: WHITE, color:"#dc2626", border:"1px solid #ddd", borderRadius:"8px", cursor:"pointer" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <SuiteModal
          suite={editingSuite}
          onClose={() => setShowModal(false)}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}