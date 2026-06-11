// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import "./dashboard.css";
import { getAuthHeaders } from "../utils/auth";
import BulkMailPanel from "../components/BulkMailPanel";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function userContact(user) {
  return user.email || user.mobile || user.username || "";
}

function userLabel(user) {
  const contact = userContact(user);
  return `${user.name}${contact ? ` - ${contact}` : ""}`;
}

function resultCandidateName(result) {
  return result.CandidateName || result.userName || "Unknown";
}

function resultCandidateContact(result) {
  return result.CandidateEmail || result.userEmail || "-";
}

function resultPct(result) {
  return result.totalMarks > 0 ? Math.round(((result.score || 0) / result.totalMarks) * 100) : 0;
}

function resultTestName(result) {
  return result.testName || result.suiteId?.name || "Assessment";
}

function resultStatus(result) {
  if (typeof result.passed === "boolean") return result.passed ? "Pass" : "Fail";
  return resultPct(result) >= 50 ? "Pass" : "Fail";
}

function matchesUserResult(result, user) {
  const tokens = [
    user.email,
    user.mobile,
    user.username,
    user.name,
  ].filter(Boolean).map(value => String(value).toLowerCase());
  const haystack = [
    result.CandidateEmail,
    result.userEmail,
    result.CandidateName,
    result.userName,
  ].filter(Boolean).join(" ").toLowerCase();
  return tokens.some(token => haystack.includes(token));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) : "-";
}

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
  const [users, setUsers] = useState([]);
  const [reportResults, setReportResults] = useState([]);
  const [assignmentSuiteId, setAssignmentSuiteId] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentPublic, setAssignmentPublic] = useState(true);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [reportUserId, setReportUserId] = useState("");

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

  useEffect(() => {
    let ignore = false;
    const fetchAdminData = async () => {
      try {
        const headers = getAuthHeaders();
        const [usersRes, resultsRes] = await Promise.all([
          axios.get(`${API}/api/auth/users`, { headers }),
          axios.get(`${API}/api/results/all`, { headers }),
        ]);
        if (ignore) return;
        setUsers(usersRes.data);
        setReportResults(resultsRes.data);
      } catch (err) {
        console.error("Failed to fetch admin data:", err);
      }
    };
    fetchAdminData();
    return () => { ignore = true; };
  }, []);

  const totalQuestions = suites.reduce((sum, suite) => sum + (suite.questionCount ?? 0), 0);
  const activeSuites = suites.filter(suite => suite.status === "active").length;
  const candidateUsers = users.filter(item => item.role === "candidate" && item.isActive !== false);
  const selectedAssignmentSuite = suites.find(suite => suite._id === assignmentSuiteId);
  const selectedReportUser = users.find(item => item._id === reportUserId);
  const assignmentFilteredUsers = candidateUsers.filter(item =>
    userLabel(item).toLowerCase().includes(assignmentSearch.toLowerCase()) ||
    (item.project || "").toLowerCase().includes(assignmentSearch.toLowerCase()) ||
    (item.designation || "").toLowerCase().includes(assignmentSearch.toLowerCase())
  );
  const reportFilteredUsers = users.filter(item =>
    userLabel(item).toLowerCase().includes(reportSearch.toLowerCase()) ||
    (item.project || "").toLowerCase().includes(reportSearch.toLowerCase()) ||
    (item.designation || "").toLowerCase().includes(reportSearch.toLowerCase())
  );
  const selectedUserResults = selectedReportUser
    ? reportResults.filter(result => matchesUserResult(result, selectedReportUser))
    : [];

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
    } catch {
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

  const handleAssignmentSuiteChange = (suiteId) => {
    setAssignmentSuiteId(suiteId);
    const suite = suites.find(item => item._id === suiteId);
    setAssignmentPublic(suite?.isPublic !== false);
    setAssignedUserIds((suite?.assignedUsers || []).map(id => String(id)));
  };

  const toggleAssignedUser = (userId) => {
    setAssignedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const saveSuiteAssignments = async () => {
    if (!assignmentSuiteId) return alert("Select a test suite first.");
    if (!assignmentPublic && assignedUserIds.length === 0) {
      return alert("Select at least one user, or keep the suite public.");
    }

    setAssignmentSaving(true);
    try {
      const res = await axios.put(
        `${API}/api/test-suites/${assignmentSuiteId}/assignments`,
        { isPublic: assignmentPublic, assignedUsers: assignedUserIds },
        { headers: getAuthHeaders() }
      );
      setSuites(prev => prev.map(suite =>
        suite._id === res.data._id
          ? { ...suite, ...res.data, questionCount: suite.questionCount }
          : suite
      ));
      alert("Test suite assignment saved.");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to save suite assignment.");
    } finally {
      setAssignmentSaving(false);
    }
  };

  const downloadPersonalExcel = () => {
    if (!selectedReportUser) return alert("Select a user first.");
    if (selectedUserResults.length === 0) return alert("No reports found for this user.");

    const rows = selectedUserResults.map(result => ({
      "Test Name": resultTestName(result),
      "Candidate": resultCandidateName(result),
      "Contact": resultCandidateContact(result),
      "Project": result.project || "-",
      "Department": result.designation || "-",
      "Score": `${result.score || 0}/${result.totalMarks || 0}`,
      "Percentage": `${resultPct(result)}%`,
      "Result": resultStatus(result),
      "Submitted At": result.submittedAt ? new Date(result.submittedAt).toLocaleString() : "-",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(key => ({ wch: Math.max(16, key.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, "Personal Report");
    XLSX.writeFile(wb, `personal_report_${selectedReportUser.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.xlsx`);
  };

  const downloadPersonalPDF = () => {
    if (!selectedReportUser) return alert("Select a user first.");
    if (selectedUserResults.length === 0) return alert("No reports found for this user.");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFillColor(26, 61, 40);
    doc.rect(0, 0, 297, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Snehalaya Personal Test Report", 14, 10);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${selectedReportUser.name}  |  ${userContact(selectedReportUser) || "-"}`, 14, 17);
    doc.text(new Date().toLocaleDateString("en-IN"), 283, 15, { align: "right" });

    autoTable(doc, {
      startY: 32,
      head: [["#", "Test Name", "Candidate", "Contact", "Project", "Department", "Score", "%", "Result", "Submitted"]],
      body: selectedUserResults.map((result, index) => [
        index + 1,
        resultTestName(result),
        resultCandidateName(result),
        resultCandidateContact(result),
        result.project || "-",
        result.designation || "-",
        `${result.score || 0}/${result.totalMarks || 0}`,
        `${resultPct(result)}%`,
        resultStatus(result),
        result.submittedAt ? new Date(result.submittedAt).toLocaleDateString("en-IN") : "-",
      ]),
      styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [26, 61, 40], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 247, 244] },
    });

    doc.save(`personal_report_${selectedReportUser.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`);
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

        <section className="admin-management-grid">
          <div className="admin-management-card">
            <div className="admin-panel-heading">
              <h3>Assign Test Suite</h3>
              <p>Make a suite public, or assign it only to selected users.</p>
            </div>

            <select value={assignmentSuiteId} onChange={(e) => handleAssignmentSuiteChange(e.target.value)}>
              <option value="">Select test suite</option>
              {suites.map(suite => (
                <option key={suite._id} value={suite._id}>{suite.name}</option>
              ))}
            </select>

            <label className="admin-check-row">
              <input
                type="checkbox"
                checked={assignmentPublic}
                onChange={(e) => setAssignmentPublic(e.target.checked)}
              />
              Available to all active candidates
            </label>

            {!assignmentPublic && (
              <>
                <input
                  value={assignmentSearch}
                  onChange={(e) => setAssignmentSearch(e.target.value)}
                  placeholder="Search users by name, contact, project..."
                />
                <div className="admin-user-pick-list">
                  {assignmentFilteredUsers.slice(0, 12).map(candidate => (
                    <label key={candidate._id}>
                      <input
                        type="checkbox"
                        checked={assignedUserIds.includes(candidate._id)}
                        onChange={() => toggleAssignedUser(candidate._id)}
                      />
                      <span>
                        <strong>{candidate.name}</strong>
                        <small>{userContact(candidate) || candidate.project || "Candidate"}</small>
                      </span>
                    </label>
                  ))}
                  {assignmentFilteredUsers.length === 0 && <p>No matching users.</p>}
                </div>
              </>
            )}

            <div className="admin-panel-footer">
              <span>
                {selectedAssignmentSuite
                  ? assignmentPublic ? "Public suite" : `${assignedUserIds.length} user(s) selected`
                  : "Choose a suite"}
              </span>
              <button type="button" onClick={saveSuiteAssignments} disabled={assignmentSaving}>
                {assignmentSaving ? "Saving..." : "Save Assignment"}
              </button>
            </div>
          </div>

          <div className="admin-management-card">
            <div className="admin-panel-heading">
              <h3>User Personal Reports</h3>
              <p>Search a user and download only their submitted test reports.</p>
            </div>

            <input
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              placeholder="Search user by name, username, mobile, email..."
            />
            <select value={reportUserId} onChange={(e) => setReportUserId(e.target.value)}>
              <option value="">Select user</option>
              {reportFilteredUsers.slice(0, 40).map(item => (
                <option key={item._id} value={item._id}>{userLabel(item)}</option>
              ))}
            </select>

            <div className="admin-report-summary">
              <strong>{selectedUserResults.length}</strong>
              <span>report(s) found</span>
            </div>

            <div className="admin-report-actions">
              <button type="button" onClick={downloadPersonalPDF}>Download PDF</button>
              <button type="button" onClick={downloadPersonalExcel}>Download Excel</button>
            </div>
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
                      <p>
                        {suite.questionCount ?? 0} questions <span>•</span> Pass {suite.passingPercentage ?? 50}%
                        <span>•</span> Uploaded {formatDate(suite.createdAt)}
                      </p>
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
