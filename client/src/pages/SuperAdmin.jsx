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
      .then((overview) => {
        if (!ignore) {
          setOverview(overview);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.response?.data?.message || "Unable to load users");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [setOverview]);

  const updateAccess = async (userId, isActive) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API_URL}/superadmin/users/${userId}/access`,
        { isActive },
        { headers: { Authorization: token } },
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

  const filteredUsers = users.filter((user) =>
    `${user.name} ${user.email} ${user.role}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="container">
      <aside className="sidebar">
        <div className="logo">
          <h2>PersonaAdmin</h2>
        </div>

        <nav>
          <a href="#" className="active">Dashboard</a>
          <a href="#users">Users</a>
          <a href="#users">Administrators</a>
          <a href="#users">Reports</a>
          <a href="#users">Settings</a>
          <button type="button" onClick={logout}>Logout</button>
        </nav>
      </aside>

      <main className="main-content">
        <section className="welcome-card">
          <div>
            <h1>Welcome Back, Super Admin</h1>
            <p>Manage users, administrators and monitor assessment activities.</p>
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <h3>Total Users</h3>
            <h2>{stats.totalUsers}</h2>
          </div>
          <div className="stat-card">
            <h3>Active Users</h3>
            <h2>{stats.activeUsers}</h2>
          </div>
          <div className="stat-card">
            <h3>Administrators</h3>
            <h2>{stats.administrators}</h2>
          </div>
          <div className="stat-card">
            <h3>Assessments</h3>
            <h2>{stats.assessments}</h2>
          </div>
        </section>

        <section className="card" id="users">
          <div className="section-header">
            <h2>User Management</h2>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search users..."
            />
          </div>

          {error && <p className="error-message">{error}</p>}

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
                        onChange={(event) => updateAccess(user._id, event.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && !error && filteredUsers.length === 0 && (
            <p className="empty-message">No users found.</p>
          )}
          {loading && <p className="empty-message">Loading users...</p>}
        </section>
      </main>
    </div>
  );
}

export default SuperAdmin;
