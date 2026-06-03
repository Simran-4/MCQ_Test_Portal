import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./superadmin.css";

const API_URL = "https://mcqtestportal-production.up.railway.app/api/auth";

const emptyStats = {
  totalUsers: 0,
  activeUsers: 0,
  administrators: 0,
  assessments: 0,
};

const getOverview = async () => {
  const token = localStorage.getItem("token");
  const res = await axios.get(`${API_URL}/superadmin/overview`, {
    headers: { Authorization: token },
  });
  return res.data;
};

function SuperAdmin() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeNav, setActiveNav] = useState("dashboard"); // ✅ track active nav

  const setOverview = useCallback((overview) => {
    setUsers(overview.users);
    setStats(overview.stats);
    setError("");
  }, []);

  const fetchOverview = async () => {
    try {
      setOverview(await getOverview());
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    getOverview()
      .then((overview) => { if (!ignore) setOverview(overview); })
      .catch((err) => { if (!ignore) setError(err.response?.data?.message || "Unable to load users"); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [setOverview]);

  const updateAccess = async (userId, isActive) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API_URL}/superadmin/users/${userId}/access`,
        { isActive },
        { headers: { Authorization: token } }
      );
      await fetchOverview();
    } catch (err) {
      alert(err.response?.data?.message || "Unable to update user access");
    }
  };

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  // ✅ Filter based on active nav
  const getFilteredUsers = () => {
    let base = users;
    if (activeNav === "students") base = users.filter(u => u.role === "student");
    if (activeNav === "administrators") base = users.filter(u => u.role === "admin" || u.role === "superadmin");
    return base.filter(u =>
      `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase())
    );
  };

  const filteredUsers = getFilteredUsers();

  // ✅ Section title based on nav
  const getSectionTitle = () => {
    if (activeNav === "students") return "Students";
    if (activeNav === "administrators") return "Administrators";
    if (activeNav === "reports") return "Reports";
    if (activeNav === "settings") return "Settings";
    return "User Management";
  };

  return (
    <div className="container">
      <aside className="sidebar">
        <div className="superadmin-brand">
          <img src="/Logo.png" alt="Snehalaya logo" />
          <div>
            <p>MCQ Test Portal</p>
            <h2>Super Admin</h2>
          </div>
        </div>

        <nav>
          {/* ✅ All nav buttons now work */}
          <button
            type="button"
            className={activeNav === "dashboard" ? "active" : ""}
            onClick={() => { setActiveNav("dashboard"); setSearch(""); }}
          >
            🏠 Dashboard
          </button>

          <button
            type="button"
            className={activeNav === "students" ? "active" : ""}
            onClick={() => { setActiveNav("students"); setSearch(""); }}
          >
            🎓 Students
          </button>

          <button
            type="button"
            className={activeNav === "administrators" ? "active" : ""}
            onClick={() => { setActiveNav("administrators"); setSearch(""); }}
          >
            🛡️ Administrators
          </button>

          <button
            type="button"
            className={activeNav === "reports" ? "active" : ""}
            onClick={() => { setActiveNav("reports"); setSearch(""); }}
          >
            📊 Reports
          </button>

          <button
            type="button"
            className={activeNav === "settings" ? "active" : ""}
            onClick={() => { setActiveNav("settings"); setSearch(""); }}
          >
            ⚙️ Settings
          </button>

          <button type="button" onClick={logout}>
            🚪 Logout
          </button>
        </nav>
      </aside>

      <main className="main-content">

        {/* WELCOME CARD - only on dashboard */}
        {activeNav === "dashboard" && (
          <section className="welcome-card">
            <div>
              <h1>Welcome Back, Super Admin</h1>
              <p>Manage users, administrators and monitor assessment activities.</p>
            </div>
          </section>
        )}

        {/* STATS - only on dashboard */}
        {activeNav === "dashboard" && (
          <section className="stats-grid">
            <div className="stat-card" onClick={() => setActiveNav("students")} style={{ cursor: "pointer" }}>
              <h3>Total Users</h3>
              <h2>{stats.totalUsers}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>Click to view →</p>
            </div>
            <div className="stat-card" onClick={() => setActiveNav("students")} style={{ cursor: "pointer" }}>
              <h3>Active Users</h3>
              <h2>{stats.activeUsers}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>Click to view →</p>
            </div>
            <div className="stat-card" onClick={() => setActiveNav("administrators")} style={{ cursor: "pointer" }}>
              <h3>Administrators</h3>
              <h2>{stats.administrators}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>Click to view →</p>
            </div>
            <div className="stat-card">
              <h3>Assessments</h3>
              <h2>{stats.assessments}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>Total submitted</p>
            </div>
          </section>
        )}

        {/* REPORTS VIEW */}
        {activeNav === "reports" && (
          <section className="card">
            <div className="section-header">
              <h2>📊 Reports</h2>
            </div>
            <div style={{ textAlign: "center", padding: "60px 0", color: "#888" }}>
              <div style={{ fontSize: "60px", marginBottom: "20px" }}>📊</div>
              <h3 style={{ fontSize: "22px", color: "#2d5d50", marginBottom: "10px" }}>
                Total Assessments Submitted
              </h3>
              <div style={{
                fontSize: "64px",
                fontWeight: "800",
                color: "#1f5d42",
                margin: "20px 0"
              }}>
                {stats.assessments}
              </div>
              <p style={{ color: "#aaa" }}>View detailed results in the Admin Dashboard</p>
              <button
                onClick={() => navigate("/view-results")}
                style={{
                  marginTop: "24px",
                  padding: "12px 30px",
                  background: "linear-gradient(135deg, #1f4037, #2c7744)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "16px",
                  cursor: "pointer",
                }}
              >
                View All Results →
              </button>
            </div>
          </section>
        )}

        {/* SETTINGS VIEW */}
        {activeNav === "settings" && (
          <section className="card">
            <div className="section-header">
              <h2>⚙️ Settings</h2>
            </div>
            <div style={{ textAlign: "center", padding: "60px 0", color: "#888" }}>
              <div style={{ fontSize: "60px", marginBottom: "20px" }}>⚙️</div>
              <h3 style={{ fontSize: "22px", color: "#2d5d50", marginBottom: "10px" }}>
                Exam Settings
              </h3>
              <p style={{ color: "#aaa", marginBottom: "24px" }}>
                Configure exam duration and question limits
              </p>
              <button
                onClick={() => navigate("/settings")}
                style={{
                  padding: "12px 30px",
                  background: "linear-gradient(135deg, #1f4037, #2c7744)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "16px",
                  cursor: "pointer",
                }}
              >
                Go to Exam Settings →
              </button>
            </div>
          </section>
        )}

        {/* USER TABLE - dashboard, students, administrators */}
        {(activeNav === "dashboard" || activeNav === "students" || activeNav === "administrators") && (
          <section className="card" id="users">
            <div className="section-header">
              <h2>{getSectionTitle()}</h2>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
              />
            </div>

            {error && <p className="error-message">{error}</p>}

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user._id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`badge ${user.role === "student" ? "student" : "admin"}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>{user.isActive ? "Active" : "Disabled"}</td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={user.isActive}
                            onChange={(e) => updateAccess(user._id, e.target.checked)}
                          />
                          <span className="slider"></span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!loading && !error && filteredUsers.length === 0 && (
              <p className="empty-message">No users found.</p>
            )}
            {loading && <p className="empty-message">Loading users...</p>}
          </section>
        )}

      </main>
    </div>
  );
}

export default SuperAdmin;