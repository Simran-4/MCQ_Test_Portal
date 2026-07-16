import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { canAdmin, getAuthHeaders, getCurrentUser } from "../utils/auth";
import { registerPathForNext } from "../utils/authRedirect";

const API = import.meta.env.VITE_API_URL || "";

function uniqueEmails(users) {
  return [...new Set(users.map(user => user.email).filter(Boolean))];
}

export default function BulkMailPanel({ compact = false }) {
  const currentUser = getCurrentUser();
  const [users, setUsers] = useState([]);
  const [suites, setSuites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [suiteId, setSuiteId] = useState("");
  const [subject, setSubject] = useState("Assessment link");
  const [message, setMessage] = useState("Dear candidate,\n\nPlease use the test link below to attend the assessment.\n\nThank you.");
  const allowed = canAdmin("canBulkMail", currentUser);

  useEffect(() => {
    let ignore = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        if (!allowed) return;
        const headers = getAuthHeaders();
        const [usersRes, suitesRes] = await Promise.allSettled([
          axios.get(`${API}/api/auth/users`, { headers }),
          axios.get(`${API}/api/test-suites`, { headers }),
        ]);

        if (ignore) return;
        if (usersRes.status === "fulfilled") {
          setUsers(usersRes.value.data);
        } else {
          const resultsRes = await axios.get(`${API}/api/results/all`, { headers });
          const resultUsers = resultsRes.data.map(result => ({
            name: result.CandidateName || result.userName || "Candidate",
            email: result.CandidateEmail || result.userEmail,
            role: "candidate",
            project: result.project || "",
            designation: result.designation || "",
          }));
          if (!ignore) setUsers(resultUsers);
        }
        if (suitesRes.status === "fulfilled") setSuites(suitesRes.value.data);
      } catch (err) {
        console.error("Bulk mail data load failed", err);
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    fetchData();
    return () => { ignore = true; };
  }, [allowed]);

  const projects = useMemo(() => [...new Set(users.map(user => user.project).filter(Boolean))].sort(), [users]);
  const roles = useMemo(() => [...new Set(users.map(user => user.customRole || user.role).filter(Boolean))].sort(), [users]);
  const selectedSuite = suites.find(suite => suite._id === suiteId);
  const testUrl = selectedSuite
    ? new URL(registerPathForNext(`/test/${selectedSuite._id}`), window.location.origin).href
    : "";

  const filteredUsers = users.filter(user => {
    const displayRole = user.customRole || user.role;
    if (roleFilter && displayRole !== roleFilter) return false;
    if (projectFilter && user.project !== projectFilter) return false;
    return user.isActive !== false && user.email;
  });

  const openMail = () => {
    const recipients = uniqueEmails(filteredUsers);
    if (recipients.length === 0) return alert("No recipients found for this filter.");
    const body = `${message}${testUrl ? `\n\nTest: ${selectedSuite?.name}\n${testUrl}` : ""}`;
    const href = `mailto:?bcc=${encodeURIComponent(recipients.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(href, "_self");
  };

  const fieldStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #d9e4dd",
    fontSize: "14px",
    boxSizing: "border-box",
    background: "#fff",
  };

  return (
    <div style={{ border: "1px solid #dfe8e2", borderRadius: "16px", padding: compact ? "16px" : "20px", background: "#fbfcfb" }}>
      {!allowed ? (
        <div style={{ color: "#991b1b", fontWeight: 700 }}>Bulk mail permission is disabled for your account.</div>
      ) : (
        <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", marginBottom: "14px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "#1A3D28", fontSize: compact ? "17px" : "20px" }}>Bulk Mail</h3>
          <p style={{ margin: "4px 0 0", color: "#6b716f", fontSize: "13px" }}>
            Send test URLs or custom messages to registered users.
          </p>
        </div>
        <div style={{ padding: "6px 10px", borderRadius: "999px", background: "#e8f4ed", color: "#166534", fontWeight: 700, fontSize: "12px" }}>
          {loading ? "Loading..." : `${uniqueEmails(filteredUsers).length} recipient(s)`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "10px" }}>
        <select style={fieldStyle} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {roles.map(role => <option key={role} value={role}>{role}</option>)}
        </select>
        <select style={fieldStyle} value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map(project => <option key={project} value={project}>{project}</option>)}
        </select>
        <select style={fieldStyle} value={suiteId} onChange={e => setSuiteId(e.target.value)}>
          <option value="">No test link</option>
          {suites.map(suite => <option key={suite._id} value={suite._id}>{suite.name}</option>)}
        </select>
      </div>

      <input
        style={{ ...fieldStyle, marginBottom: "10px" }}
        value={subject}
        onChange={e => setSubject(e.target.value)}
        placeholder="Email subject"
      />
      <textarea
        rows={compact ? 4 : 5}
        style={{ ...fieldStyle, resize: "vertical", marginBottom: "12px", lineHeight: 1.45 }}
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Write custom email message"
      />

      {testUrl && (
        <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#f0faf5", color: "#1A3D28", fontSize: "13px", marginBottom: "12px", wordBreak: "break-all" }}>
          {testUrl}
        </div>
      )}

      <button
        type="button"
        onClick={openMail}
        disabled={loading}
        style={{
          padding: "11px 18px",
          border: "none",
          borderRadius: "10px",
          background: "#2D5F3F",
          color: "#fff",
          fontWeight: 700,
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        Open Mail App
      </button>
      <p style={{ margin: "10px 0 0", color: "#8A8A7E", fontSize: "12px" }}>
        Emails open in BCC. For automatic server sending, SMTP credentials must be configured on the backend.
      </p>
      </>
      )}
    </div>
  );
}
