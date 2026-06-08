// src/pages/ViewResults.jsx
import { useEffect, useState } from "react";
import axios from "axios";
import "../styles/quiz.css"; // Ensure your shared styles are available

const API_BASE = "https://charismatic-happiness-production-dc36.up.railway.app/api";

export default function ViewResults() {
  const [results, setResults] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
    fetchResults();
  }, [filterProject]); // Re-fetch when project filter changes

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${API_BASE}/results/projects`);
      setProjects(res.data);
    } catch (err) {
      console.error("Error fetching projects", err);
    }
  };

  const fetchResults = async () => {
    setLoading(true);
    try {
      // Use the advanced /all endpoint we created in resultRoutes.js
      const res = await axios.get(`${API_BASE}/results/all`, {
        params: { 
          project: filterProject,
          search: searchQuery 
        }
      });
      setResults(res.data);
    } catch (err) {
      console.error("Error fetching results", err);
    } finally {
      setLoading(false);
    }
  };

  // Handle search with a manual trigger (or you could use a debounce)
  const handleSearch = (e) => {
    e.preventDefault();
    fetchResults();
  };

  return (
    <div style={{ padding: "40px 20px", background: "#EEE9E0", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        
        <header style={{ marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ color: "#1A3D28", margin: 0 }}>Candidate Results</h1>
            <p style={{ color: "#6B6B5E" }}>Overview of all assessment performances</p>
          </div>

          {/* Filters Section */}
          <div style={{ display: "flex", gap: "15px" }}>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px" }}>
              <input 
                type="text" 
                placeholder="Search name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "10px 15px", borderRadius: "8px", border: "1px solid #ccc" }}
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
                  <th>Project / Designation</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res) => (
                  <tr key={res._id} style={{ borderBottom: "1px solid #F0F0F0" }}>
                    <td style={{ padding: "18px" }}>
                      <div style={{ fontWeight: "600", color: "#1A3D28" }}>{res.userName}</div>
                      <div style={{ fontSize: "12px", color: "#888" }}>{res.userEmail}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: "14px" }}>{res.project}</div>
                      <div style={{ fontSize: "11px", color: "#8A8A7E" }}>{res.designation}</div>
                    </td>
                    <td style={{ fontWeight: "700" }}>{res.score} / {res.totalMarks}</td>
                    <td>{Math.round((res.score / res.totalMarks) * 100)}%</td>
                    <td>
                      <span style={{ 
                        padding: "5px 12px", 
                        borderRadius: "20px", 
                        fontSize: "12px", 
                        fontWeight: "700",
                        background: res.passed ? "#E8F2EC" : "#FDECEC",
                        color: res.passed ? "#2D5F3F" : "#C53030"
                      }}>
                        {res.passed ? "PASS" : "FAIL"}
                      </span>
                    </td>
                    <td style={{ fontSize: "13px", color: "#666" }}>
                      {new Date(res.submittedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>No results found matching your criteria.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}