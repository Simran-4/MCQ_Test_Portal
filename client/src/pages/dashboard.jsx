// src/pages/Dashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./dashboard.css";

const API        = import.meta.env.VITE_API_URL || "http://localhost:5000";
const GREEN      = "#2D5F3F";
const GREEN_DARK = "#1A3D28";
const BG         = "#EEE9E0";
const WHITE      = "#ffffff";

// --- MODAL COMPONENT ---
function SuiteModal({ suite, onClose, onSave }) {
  const [name, setName]        = useState(suite?.name || "");
  const [description, setDesc] = useState(suite?.description || "");
  const [status, setStatus]    = useState(suite?.status || "draft");
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setLoading(true);
    setError("");
    try {
      const token  = localStorage.getItem("token");
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const payload = { name, description, status };
      if (suite) {
        const res = await axios.put(`${API}/api/test-suites/${suite._id}`, payload, config);
        onSave(res.data, "edit");
      } else {
        const res = await axios.post(`${API}/api/test-suites`, payload, config);
        onSave(res.data, "create");
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Server connection failed.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", border: "1px solid #ddd", borderRadius: "10px",
    padding: "10px 12px", fontSize: "14px", outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: WHITE, borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "420px", margin: "0 16px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <h2 style={{ fontSize: "17px", fontWeight: "700", color: GREEN_DARK, marginBottom: "18px" }}>
          {suite ? "Edit Test Suite" : "New Test Suite"}
        </h2>
        {error && <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "12px", background: "#fee2e2", padding: "8px", borderRadius: "6px" }}>{error}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name *</label>
            <input style={inputStyle} placeholder="e.g. Botany Unit 1" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Description (optional)</label>
            <input style={inputStyle} placeholder="Short description" value={description} onChange={e => setDesc(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</label>
            <select style={inputStyle} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "22px" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", fontSize: "14px", borderRadius: "22px", border: "1px solid #ddd", background: WHITE, cursor: "pointer", fontWeight: "600", color: "#555" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} style={{ padding: "10px 22px", fontSize: "14px", borderRadius: "22px", border: "none", background: GREEN, color: WHITE, cursor: "pointer", fontWeight: "600", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Saving…" : suite ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MAIN DASHBOARD COMPONENT ---
export default function Dashboard() {
  const navigate = useNavigate();
  const [suites, setSuites]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editingSuite, setEditing]  = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => { fetchSuites(); }, []);

  const fetchSuites = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/api/test-suites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
    fetchSuites();
  };

  const handleDelete = async (suiteId, suiteName, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${suiteName}" and all its questions?`)) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/api/test-suites/${suiteId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuites(prev => prev.filter(s => s._id !== suiteId));
    } catch (err) {
      alert("Delete failed: " + (err.response?.data?.message || "Check your permissions."));
    }
  };

  // ── Feature 4: Toggle active/inactive ──────────────────────
  const handleToggleStatus = async (suiteId, currentStatus, e) => {
    e.stopPropagation();
    setTogglingId(suiteId);
    try {
      const token = localStorage.getItem("token");
      const newStatus = currentStatus === "active" ? "draft" : "active";
      await axios.put(
        `${API}/api/test-suites/${suiteId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuites(prev => prev.map(s =>
        s._id === suiteId ? { ...s, status: newStatus } : s
      ));
    } catch (err) {
      alert("Failed to update status.");
    } finally {
      setTogglingId(null);
    }
  };

  // ── Feature 14: Copy direct test link ──────────────────────
  const handleCopyLink = (suiteId, e) => {
    e.stopPropagation();
    const url = `${window.location.origin}/test/${suiteId}`;
    navigator.clipboard.writeText(url)
      .then(() => alert("Test link copied! Share this with candidates."))
      .catch(() => alert(`Share this link: ${url}`));
  };

  return (
    <div className="dashboard-page" style={{ minHeight: "100vh", background: BG }}>
      {/* HEADER */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="logo-circle">📋</div>
          <div>
            <div className="dashboard-title">Admin Dashboard</div>
            <div className="dashboard-subtitle">Manage test suites and questions.</div>
          </div>
        </div>
        <div className="admin-section">
          <div className="admin-profile">
            <div className="admin-icon">👤</div>
            <span>Admin</span>
          </div>
          <button className="logout-btn" onClick={() => { localStorage.removeItem("token"); navigate("/"); }}>
            Logout
          </button>
        </div>
      </div>

      {/* NAVBAR */}
      <div className="dashboard-nav">
        <div className="nav-item nav-active">Dashboard</div>
        <div className="nav-item" onClick={() => navigate("/view-results")}>View results</div>
        <div className="nav-item" onClick={() => navigate("/settings")}>Exam settings</div>
      </div>

      {/* CONTENT */}
      <div className="dashboard-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <div className="stat-title">TEST SUITES</div>
            <div className="stat-value">{suites.length}</div>
            <div className="stat-sub">Total suites</div>
            <div className="progress-track"><div className="progress-fill" style={{ width: "35%" }} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">❓</div>
            <div className="stat-title">TOTAL QUESTIONS</div>
            <div className="stat-value">{suites.reduce((a, s) => a + (s.questionCount ?? 0), 0)}</div>
            <div className="stat-sub">Across all suites</div>
            <div className="progress-track"><div className="progress-fill" style={{ width: "15%" }} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📡</div>
            <div className="stat-title">ACTIVE SUITES</div>
            <div className="stat-value">{suites.filter(s => s.status === "active").length}</div>
            <div className="stat-sub">Live right now</div>
            <div className="progress-track"><div className="progress-fill" style={{ width: "100%" }} /></div>
          </div>
        </div>

        <div className="section-header">
          <div className="section-title">
            TEST SUITES
            <div className="section-line"></div>
          </div>
          <button className="new-suite-btn" onClick={() => { setEditing(null); setShowModal(true); }}>
            + New test suite
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>Loading your suites...</div>
        ) : suites.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", background: WHITE, borderRadius: "16px", border: "2px dashed #ccc" }}>
            <p style={{ color: "#999" }}>No suites available. Create your first one above!</p>
          </div>
        ) : (
          <div className="suite-list">
            {suites.map((suite) => (
              <div key={suite._id} className="suite-card">
                <div className="suite-left">
                  <div className="suite-icon">📄</div>
                  <div>
                    <div className="suite-name">{suite.name}</div>
                    <div className="suite-info">{suite.questionCount ?? 0} questions</div>
                  </div>
                </div>
                <div className="suite-right">
                  {/* Status pill */}
                  <div className="status-pill" style={{
                    background: suite.status === "active" ? "#dcfce7" : "#f3f4f6",
                    color: suite.status === "active" ? "#166534" : "#4b5563",
                    padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "600"
                  }}>
                    {suite.status}
                  </div>

                  {/* Feature 4: Toggle active/inactive */}
                  <button
                    className="action-btn"
                    disabled={togglingId === suite._id}
                    onClick={(e) => handleToggleStatus(suite._id, suite.status, e)}
                    style={{
                      background: suite.status === "active" ? "#fee2e2" : "#dcfce7",
                      color: suite.status === "active" ? "#dc2626" : "#166534",
                      border: "none", borderRadius: "8px", padding: "6px 12px",
                      fontWeight: "600", fontSize: "12px", cursor: "pointer"
                    }}
                  >
                    {togglingId === suite._id
                      ? "..."
                      : suite.status === "active" ? "⏸ Deactivate" : "▶ Activate"}
                  </button>

                  {/* Feature 14: Copy link */}
                  <button
                    className="action-btn"
                    onClick={(e) => handleCopyLink(suite._id, e)}
                    style={{ fontSize: "12px" }}
                  >
                    📋 Copy Link
                  </button>

                  <button className="action-btn open-btn" onClick={() => navigate(`/admin/test-suites/${suite._id}`)}>
                    Open
                  </button>
                  <button className="action-btn" onClick={() => { setEditing(suite); setShowModal(true); }}>
                    Edit
                  </button>
                  <button className="action-btn delete-btn" onClick={(e) => handleDelete(suite._id, suite.name, e)}>
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