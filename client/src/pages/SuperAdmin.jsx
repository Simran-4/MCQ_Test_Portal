import React, { useEffect } from "react";
import "./superadmin.css";

function SuperAdmin() {

  useEffect(() => {

    const searchInput = document.getElementById("searchInput");
    const rows = document.querySelectorAll("#userTable tr");

    if (searchInput) {
      searchInput.addEventListener("keyup", () => {

        const value = searchInput.value.toLowerCase();

        rows.forEach((row) => {
          row.style.display = row.innerText
            .toLowerCase()
            .includes(value)
            ? ""
            : "none";
        });

      });
    }

  }, []);

  return (

    <div className="container">

      {/* Sidebar */}
      <aside className="sidebar">

        <div className="logo">
          <h2>🧠 PersonaAdmin</h2>
        </div>

        <nav>
          <a href="#" className="active">Dashboard</a>
          <a href="#">Users</a>
          <a href="#">Administrators</a>
          <a href="#">Reports</a>
          <a href="#">Settings</a>
          <a href="#">Logout</a>
        </nav>

      </aside>

      {/* Main */}
      <main className="main-content">

        {/* Welcome */}
        <section className="welcome-card">

          <div>
            <h1>Welcome Back, Super Admin 👋</h1>

            <p>
              Manage users, Administrators and monitor assessment activities.
            </p>
          </div>

        </section>

        {/* Stats */}
        <section className="stats-grid">

          <div className="stat-card">
            <h3>Total Users</h3>
            <h2>1240</h2>
          </div>

          <div className="stat-card">
            <h3>Active Users</h3>
            <h2>1185</h2>
          </div>

          <div className="stat-card">
            <h3>Administrators</h3>
            <h2>15</h2>
          </div>

          <div className="stat-card">
            <h3>Assessments</h3>
            <h2>3480</h2>
          </div>

        </section>

        {/* User Management */}
        <section className="card">

          <div className="section-header">

            <h2>User Management</h2>

            <input
              type="text"
              id="searchInput"
              placeholder="Search users..."
            />

          </div>

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

            <tbody id="userTable">

              <tr>
                <td>Rahul Sharma</td>
                <td>rahul@gmail.com</td>
                <td><span className="badge student">Student</span></td>
                <td>Active</td>

                <td>
                  <label className="switch">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </td>

              </tr>

              <tr>
                <td>Priya Singh</td>
                <td>priya@gmail.com</td>
                <td><span className="badge student">Student</span></td>
                <td>Disabled</td>

                <td>
                  <label className="switch">
                    <input type="checkbox" />
                    <span className="slider"></span>
                  </label>
                </td>

              </tr>

              <tr>
                <td>Amit Verma</td>
                <td>amit@gmail.com</td>
                <td><span className="badge admin">Admin</span></td>
                <td>Active</td>

                <td>
                  <label className="switch">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </td>

              </tr>

            </tbody>

          </table>

        </section>

      </main>

    </div>

  );
}

export default SuperAdmin;