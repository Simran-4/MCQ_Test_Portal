// src/pages/ViewResults.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import "../styles/quiz.css";
import { canAdmin, getAuthHeaders, getCurrentUser } from "../utils/auth";
import { openCertificateEmail } from "../utils/certificate";

const API = import.meta.env.VITE_API_URL || "";

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }) : "-";
}

export default function ViewResults() {
  const [results, setResults]           = useState([]);
  const [projects, setProjects]         = useState([]);
  const [filterProject, setFilterProject] = useState("");
  const [searchQuery, setSearchQuery]   = useState("");
  const [loading, setLoading]           = useState(true);
  const [suiteMap, setSuiteMap]         = useState({});
  const searchQueryRef = useRef(searchQuery);
  const currentUser = getCurrentUser();
  const canSendCertificates = canAdmin("canBulkMail", currentUser);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  const getResultTestName = (res) => {
    if (res.testName) return res.testName;
    if (res.suiteId?.name) return res.suiteId.name;
    const suiteId = typeof res.suiteId === "string" ? res.suiteId : res.suiteId?._id;
    return suiteMap[suiteId] || "Assessment";
  };

  const fetchProjects = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/results/projects`, {
        headers: getAuthHeaders(),
      });
      setProjects(res.data);
    } catch (err) {
      console.error("Error fetching projects", err);
    }
  }, []);

  const fetchSuites = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/test-suites`, {
        headers: getAuthHeaders(),
      });
      const nextMap = {};
      res.data.forEach(suite => { nextMap[suite._id] = suite.name; });
      setSuiteMap(nextMap);
    } catch (err) {
      console.error("Error fetching test suites", err);
    }
  }, []);

  const fetchResults = useCallback(async (searchValue = searchQueryRef.current) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/results/all`, {
        headers: getAuthHeaders(),
        params: { project: filterProject, search: searchValue }
      });
      setResults(res.data);
    } catch (err) {
      console.error("Error fetching results", err);
    } finally {
      setLoading(false);
    }
  }, [filterProject]);

  useEffect(() => {
    fetchProjects();
    fetchSuites();
    fetchResults();
  }, [fetchProjects, fetchResults, fetchSuites]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchResults(searchQuery);
  };

  const hasPassed = (res) => {
    if (typeof res.passed === "boolean") return res.passed;
    return res.totalMarks > 0 && Math.round((res.score / res.totalMarks) * 100) >= 50;
  };

  const handleEmailCertificate = async (res, language) => {
    if (!canSendCertificates) {
      alert("Certificate email permission is disabled for your account.");
      return;
    }
    if (!hasPassed(res)) {
      alert("Certificate can be sent only for passed candidates.");
      return;
    }
    try {
      await openCertificateEmail(res, { name: getResultTestName(res) }, language);
    } catch (err) {
      alert(err.message || "Unable to prepare certificate email.");
    }
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
          <div className="results-table-scroll" style={{ background: "white", borderRadius: "16px", overflowX: "auto", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
            <table style={{ width: "100%", minWidth: "980px", borderCollapse: "collapse", textAlign: "left" }}>
              <thead style={{ background: "#F9FAF8", borderBottom: "1px solid #EEE" }}>
                <tr>
                  <th style={{ padding: "18px" }}>Candidate</th>
                  <th style={{ padding: "18px" }}>Test Name</th>
                  <th style={{ padding: "18px" }}>Project / Department</th>
                  <th style={{ padding: "18px" }}>Score</th>
                  <th style={{ padding: "18px" }}>Percentage</th>
                  <th style={{ padding: "18px" }}>Status</th>
                  <th style={{ padding: "18px" }}>Certificate</th>
                  <th style={{ padding: "18px" }}>Attempted At</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res) => {
                  const pct = res.totalMarks > 0
                    ? Math.round((res.score / res.totalMarks) * 100)
                    : 0;
                  const passed = hasPassed(res);
                  return (
                    <tr key={res._id} style={{ borderBottom: "1px solid #F0F0F0" }}>
                      <td style={{ padding: "18px" }}>
                        <div style={{ fontWeight: "600", color: "#1A3D28" }}>{res.userName}</div>
                        <div style={{ fontSize: "12px", color: "#888" }}>{res.userEmail}</div>
                      </td>
                      <td style={{ padding: "18px", fontWeight: "600", color: "#1A3D28" }}>
                        {getResultTestName(res)}
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
                          background: passed ? "#E8F2EC" : "#FDECEC",
                          color: passed ? "#2D5F3F" : "#C53030"
                        }}>
                          {passed ? "PASS" : "FAIL"}
                        </span>
                      </td>
                      <td style={{ padding: "18px" }}>
                        {passed ? (
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => handleEmailCertificate(res, "english")}
                              disabled={!canSendCertificates}
                              style={{
                                padding: "8px 10px",
                                borderRadius: "8px",
                                border: "1px solid #2D5F3F",
                                background: canSendCertificates ? "#FFFFFF" : "#F3F4F6",
                                color: canSendCertificates ? "#1A3D28" : "#999",
                                fontWeight: "700",
                                cursor: canSendCertificates ? "pointer" : "not-allowed"
                              }}
                            >
                              Email EN
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEmailCertificate(res, "marathi")}
                              disabled={!canSendCertificates}
                              style={{
                                padding: "8px 10px",
                                borderRadius: "8px",
                                border: "1px solid #2D5F3F",
                                background: canSendCertificates ? "#F0FAF5" : "#F3F4F6",
                                color: canSendCertificates ? "#1A3D28" : "#999",
                                fontWeight: "700",
                                cursor: canSendCertificates ? "pointer" : "not-allowed"
                              }}
                            >
                              Email MR
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "#AAA" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "18px", fontSize: "13px", color: "#666" }}>
                        {formatDateTime(res.submittedAt)}
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
