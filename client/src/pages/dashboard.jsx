// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./dashboard.css";
import { getAuthHeaders } from "../utils/auth";
import BulkMailPanel from "../components/BulkMailPanel";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function SuiteModal({ suite, onClose, onSave }) {
  const [name, setName] = useState(suite?.name || "");
  const [description, setDescription] = useState(suite?.description || "");
  const [status, setStatus] = useState(suite?.status || "draft");
  const [passingPercentage, setPassingPercentage] = useState(suite?.passingPercentage ?? 50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const passMark = Number(passingPercentage);
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
      setError("Passing percentage must be between 0 and 100");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const config = { headers: getAuthHeaders() };
      const payload = {
        name: name.trim(),
        description: description.trim(),
        status,
        passingPercentage: passMark,
      };
      const res = suite
        ? await axios.put(`${API}/api/test-suites/${suite._id}`, payload, config)
        : await axios.post(`${API}/api/test-suites`, payload, config);

      onSave(res.data, suite ? "edit" : "create");
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Server connection failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="suite-modal-backdrop">
      <div className="suite-modal" role="dialog" aria-modal="true" aria-labelledby="suite-modal-title">
        <h2 id="suite-modal-title">{suite ? "Edit Test Suite" : "New Test Suite"}</h2>
        {error && <p className="suite-modal-error">{error}</p>}

        <label>
          Name *
          <input placeholder="e.g. NGO संवाद कौशल मूल्यांकन" value={name} onChange={e => setName(e.target.value)} />
        </label>

        <label>
          Description
          <input placeholder="Short description" value={description} onChange={e => setDescription(e.target.value)} />
        </label>

        <label>
          Status
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </label>

        <label>
          Passing Criteria (%)
          <input
            type="number"
            min={0}
            max={100}
            value={passingPercentage}
            onChange={e => setPassingPercentage(e.target.value)}
          />
        </label>

        <div className="suite-modal-actions">
          <button type="button" className="admin-secondary-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-primary-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : suite ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [suites, setSuites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSuite, setEditingSuite] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [showBulkMail, setShowBulkMail] = useState(false);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const fetchSuites = async () => {
    try {
      const res = await axios.get(`${API}/api/test-suites`, {
        headers: getAuthHeaders(),
      });
      setSuites(res.data);
    } catch (err) {
      console.error("Failed to fetch test suites:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuites();
  }, []);

  const totalQuestions = suites.reduce((sum, suite) => sum + (suite.questionCount ?? 0), 0);
  const activeSuites = suites.filter(suite => suite.status === "active").length;

  const handleModalSave = (suite, action) => {
    if (action === "create") {
      setSuites(prev => [{ ...suite, questionCount: 0 }, ...prev]);
    } else {
      setSuites(prev => prev.map(item => item._id === suite._id ? { ...item, ...suite } : item));
    }
    fetchSuites();
  };

  const handleDelete = async (suiteId, suiteName, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${suiteName}" and all its questions?`)) return;
    try {
      await axios.delete(`${API}/api/test-suites/${suiteId}`, {
        headers: getAuthHeaders(),
      });
      setSuites(prev => prev.filter(suite => suite._id !== suiteId));
    } catch (err) {
      alert("Delete failed: " + (err.response?.data?.message || "Check your permissions."));
    }
  };

  const handleToggleStatus = async (suiteId, currentStatus, e) => {
    e.stopPropagation();
    setTogglingId(suiteId);
    try {
      const newStatus = currentStatus === "active" ? "draft" : "active";
      await axios.put(
        `${API}/api/test-suites/${suiteId}`,
        { status: newStatus },
        { headers: getAuthHeaders() }
      );
      setSuites(prev => prev.map(suite =>
        suite._id === suiteId ? { ...suite, status: newStatus } : suite
      ));
    } catch (err) {
      alert("Failed to update status.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleCopyLink = (suiteId, e) => {
    e.stopPropagation();
    const url = `${window.location.origin}/test/${suiteId}`;
    navigator.clipboard.writeText(url)
      .then(() => alert("Test link copied! Share this with candidates."))
      .catch(() => alert(`Share this link: ${url}`));
  };

  const openNewSuite = () => {
    setEditingSuite(null);
    setShowModal(true);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <div className="admin-dashboard-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img src="/Logo.png" alt="Snehalaya logo" />
          <div>
            <h1>Snehalaya</h1>
          </div>
        </div>

        <nav className="admin-nav">
          <button type="button" className="active">
            <span>⌂</span>
            Dashboard
          </button>
          <button type="button" onClick={() => navigate("/view-results")}>
            <span>▥</span>
            View results
          </button>
          <button type="button" onClick={() => navigate("/settings")}>
            <span>⚙</span>
            Exam settings
          </button>
          <button type="button" onClick={() => setShowBulkMail(value => !value)}>
            <span>✉</span>
            Bulk mail
          </button>
        </nav>

        <div className="admin-nav-group">
          <p>Test Management</p>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <span>□</span>
            All test suites
          </button>
          <button type="button" onClick={openNewSuite}>
            <span>＋</span>
            New test suite
          </button>
        </div>

        <div className="admin-sidebar-note">
          <span>🌱</span>
          <p>Together we create a better tomorrow.</p>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <h2>Welcome back, Admin <span>🌱</span></h2>
            <p>Manage test suites and questions with ease.</p>
          </div>

          <div className="admin-top-actions">
            <div className="admin-profile-card">
              <div>{(user.name || "Admin").charAt(0).toUpperCase()}</div>
              <p>
                <strong>{user.name || "Admin"}</strong>
                <span>Administrator</span>
              </p>
            </div>
            <button type="button" className="admin-logout-btn" onClick={logout}>
              ⇥ Logout
            </button>
          </div>
        </header>

        <section className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-icon">▣</div>
            <div>
              <p>Test Suites</p>
              <strong>{suites.length}</strong>
              <span>Total suites</span>
            </div>
            <div className="admin-progress"><span style={{ width: `${Math.min(100, Math.max(22, suites.length * 16))}%` }} /></div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon">?</div>
            <div>
              <p>Total Questions</p>
              <strong>{totalQuestions}</strong>
              <span>Across all suites</span>
            </div>
            <div className="admin-progress"><span style={{ width: `${Math.min(100, Math.max(25, totalQuestions * 1.5))}%` }} /></div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon">⌁</div>
            <div>
              <p>Active Suites</p>
              <strong>{activeSuites}</strong>
              <span>Live right now</span>
            </div>
            <div className="admin-progress"><span style={{ width: `${suites.length ? Math.max(22, (activeSuites / suites.length) * 100) : 0}%` }} /></div>
          </div>
        </section>

        <section className="suite-section">
          <div className="suite-section-header">
            <div>
              <h3>Test Suites</h3>
              <p>Create, manage and monitor your test suites.</p>
            </div>
            <div>
              <button type="button" className="admin-primary-btn" onClick={openNewSuite}>
                ＋ New test suite
              </button>
            </div>
          </div>

          {showBulkMail && (
            <div className="admin-bulk-mail">
              <BulkMailPanel compact />
            </div>
          )}

          {loading ? (
            <div className="admin-empty-state">Loading your suites...</div>
          ) : suites.length === 0 ? (
            <div className="admin-empty-state">No suites available. Create your first one above.</div>
          ) : (
            <div className="admin-suite-list">
              {suites.map(suite => (
                <article key={suite._id} className="admin-suite-card">
                  <div className="admin-suite-left">
                    <div className="admin-suite-icon">▤</div>
                    <div>
                      <h4>{suite.name}</h4>
                      <p>{suite.questionCount ?? 0} questions <span>•</span> Pass {suite.passingPercentage ?? 50}%</p>
                    </div>
                  </div>

                  <div className="admin-suite-actions">
                    <span className={`admin-status ${suite.status === "active" ? "active" : "draft"}`}>
                      {suite.status === "active" ? "Active" : "Draft"}
                    </span>

                    <button
                      type="button"
                      className={`admin-toggle-btn ${suite.status === "active" ? "danger" : "success"}`}
                      disabled={togglingId === suite._id}
                      onClick={(e) => handleToggleStatus(suite._id, suite.status, e)}
                    >
                      {togglingId === suite._id
                        ? "..."
                        : suite.status === "active" ? "■ Deactivate" : "▶ Activate"}
                    </button>

                    <button type="button" className="admin-row-btn" onClick={(e) => handleCopyLink(suite._id, e)}>
                      🔗 Copy link
                    </button>
                    <button type="button" className="admin-open-btn" onClick={() => navigate(`/admin/test-suites/${suite._id}`)}>
                      Open
                    </button>
                    <button type="button" className="admin-row-btn" onClick={() => { setEditingSuite(suite); setShowModal(true); }}>
                      ✎ Edit
                    </button>
                    <button type="button" className="admin-delete-btn" onClick={(e) => handleDelete(suite._id, suite.name, e)}>
                      ⌫ Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="admin-impact-card">
            <div>
              <span>✓</span>
              <div>
                <strong>Secure. Reliable. Impactful.</strong>
                <p>Your data is safe with us. Focus on creating impact.</p>
              </div>
            </div>
            <div className="impact-line-art" aria-hidden="true">
              <span>⌁</span><span>⌁</span><span>⌁</span>
            </div>
          </div>
        </section>
      </main>

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
