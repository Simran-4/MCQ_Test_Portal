// src/pages/ViewResults.jsx
import { useEffect, useState } from "react";
import axios from "axios";
import "../styles/quiz.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function ViewResults() {
  const [results, setResults]           = useState([]);
  const [projects, setProjects]         = useState([]);
  const [filterProject, setFilterProject] = useState("");
  const [searchQuery, setSearchQuery]   = useState("");
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    fetchProjects();
    fetchResults();
  }, [filterProject]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${API}/api/results/projects`);
      setProjects(res.data);
    } catch (err) {
      console.error("Error fetching projects", err);
    }
  };

  const fetchResults = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/results/all`, {
        params: { project: filterProject, search: searchQuery }
      });
      setResults(res.data);
    } catch (err) {
      console.error("Error fetching results", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchResults();
  };

  return (
    <div style={{ padding: "40px 20px", background: "#EEE9E0", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>

        <header style={{ marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h1 style={{ color: "#1A3D28", margin: 0 }}>Candidate Results</h1>
            <p style={{ color: "#6B6B5E" }}>Overview of all assessment performances</p>
          </div>
          <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                placeholder="Search name, email, project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "10px 15px", borderRadius: "8px", border: "1px solid #ccc", minWidth: "220px" }}
              />
              <button type="submit" style={{ background: "#2D5F3F", color: "white", border: "none", borderRadius: "8px", padding: "0 20px", cursor: "pointer" }}>
                Search
              </button>
            </form>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ccc", background: "white" }}
            >
              <option value="">All Projects</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </header>

        {loading ? (
          <div style={{ textAlign: "center", padding: "50px" }}>Loading data...</div>
        ) : (
          <div style={{ background: "white", borderRadius: "16px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead style={{ background: "#F9FAF8", borderBottom: "1px solid #EEE" }}>
                <tr>
                  <th style={{ padding: "18px" }}>Candidate</th>
                  <th style={{ padding: "18px" }}>Project / Designation</th>
                  <th style={{ padding: "18px" }}>Score</th>
                  <th style={{ padding: "18px" }}>Percentage</th>
                  <th style={{ padding: "18px" }}>Status</th>
                  <th style={{ padding: "18px" }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res) => {
                  const pct = res.totalMarks > 0
                    ? Math.round((res.score / res.totalMarks) * 100)
                    : 0;
                  return (
                    <tr key={res._id} style={{ borderBottom: "1px solid #F0F0F0" }}>
                      <td style={{ padding: "18px" }}>
                        <div style={{ fontWeight: "600", color: "#1A3D28" }}>{res.userName}</div>
                        <div style={{ fontSize: "12px", color: "#888" }}>{res.userEmail}</div>
                      </td>
                      <td style={{ padding: "18px" }}>
                        <div style={{ fontSize: "14px" }}>{res.project || "—"}</div>
                        <div style={{ fontSize: "11px", color: "#8A8A7E" }}>{res.designation || "—"}</div>
                      </td>
                      <td style={{ padding: "18px", fontWeight: "700" }}>
                        {res.score} / {res.totalMarks}
                      </td>
                      <td style={{ padding: "18px" }}>{pct}%</td>
                      <td style={{ padding: "18px" }}>
                        <span style={{
                          padding: "5px 12px", borderRadius: "20px",
                          fontSize: "12px", fontWeight: "700",
                          background: res.passed ? "#E8F2EC" : "#FDECEC",
                          color: res.passed ? "#2D5F3F" : "#C53030"
                        }}>
                          {res.passed ? "PASS" : "FAIL"}
                        </span>
                      </td>
                      <td style={{ padding: "18px", fontSize: "13px", color: "#666" }}>
                        {new Date(res.submittedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {results.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>
                No results found matching your criteria.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}