import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import "./superadmin.css";
import { ADMIN_PERMISSION_DEFAULTS, getAuthHeaders, getCurrentUser } from "../utils/auth";
import BulkMailPanel from "../components/BulkMailPanel";
import { apiProjectsToMap, defaultOrgOptions, mergeOrgOptions, readLocalOrgOptions, writeLocalOrgOptions } from "../utils/orgOptions";

const API_BASE = "https://charismatic-happiness-production-dc36.up.railway.app/api";
const API_URL = `${API_BASE}/auth`;
const LOCAL_ROLES_KEY = "snehalaya_custom_roles";
const emptyCreateUserForm = {
  name: "",
  username: "",
  contactType: "email",
  email: "",
  mobile: "",
  password: "",
  role: "candidate",
  age: "",
  gender: "",
  project: "",
  designation: "",
};
const ADMIN_RIGHTS = [
  { key: "canViewReports", label: "View reports", detail: "Can open report pages and see result rows" },
  { key: "canDownloadReports", label: "Download reports", detail: "Can export summary/descriptive PDF or Excel" },
  { key: "canManageSuites", label: "Create / edit test suites", detail: "Can create, edit, activate, deactivate, and delete suites" },
  { key: "canManageQuestions", label: "Manage questions", detail: "Can add, import, edit, and delete questions" },
  { key: "canAssignTests", label: "Assign tests", detail: "Can assign test suites to candidates" },
  { key: "canManageSettings", label: "Exam settings", detail: "Can change duration and global settings" },
  { key: "canBulkMail", label: "Mail candidates", detail: "Can prepare bulk emails and certificate emails" },
  { key: "canViewUsers", label: "View users", detail: "Can see candidate/admin lists within scope" },
];
const CONTROL_MODES = [
  { key: "rights", label: "User rights" },
  { key: "roles", label: "Users, roles & assignment" },
  { key: "org", label: "Projects/Departments & designations" },
  { key: "mail", label: "Bulk mail" },
];

function normalizeRights(user) {
  const saved = user?.adminPermissions || {};
  const savedPermissions = saved.permissions || {};
  return {
    permissions: Object.keys(ADMIN_PERMISSION_DEFAULTS).reduce((acc, key) => {
      acc[key] = savedPermissions[key] === undefined
        ? ADMIN_PERMISSION_DEFAULTS[key]
        : Boolean(savedPermissions[key]);
      return acc;
    }, {}),
    scopeProjects: Array.isArray(saved.scopeProjects) ? saved.scopeProjects : [],
    scopeDepartments: Array.isArray(saved.scopeDepartments) ? saved.scopeDepartments : [],
  };
}

const emptyStats = {
  totalUsers: 0,
  activeUsers: 0,
  administrators: 0,
  totalAssessments: 0,
};

const getOverview = async () => {
  const res = await axios.get(`${API_URL}/superadmin/overview`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

function readLocalRoles() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ROLES_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocalRoles(roles) {
  localStorage.setItem(LOCAL_ROLES_KEY, JSON.stringify(roles));
}

function candidateName(result) {
  return result.CandidateName || result.userName || "Unknown";
}

function candidateEmail(result) {
  return result.CandidateEmail || result.userEmail || "-";
}

function resultPct(result) {
  return result.totalMarks > 0 ? Math.round(((result.score || 0) / result.totalMarks) * 100) : 0;
}

function resultTestName(result, suitesById) {
  if (result.testName) return result.testName;
  if (result.suiteId?.name) return result.suiteId.name;
  const suiteId = typeof result.suiteId === "string" ? result.suiteId : result.suiteId?._id;
  return suitesById[suiteId] || "Assessment";
}

function resultStatus(result) {
  if (typeof result.passed === "boolean") return result.passed ? "Pass" : "Fail";
  return resultPct(result) >= 50 ? "Pass" : "Fail";
}

function userNameKey(user) {
  return String(user?.name || "").trim().toLowerCase();
}

function userContact(user) {
  return String(user?.email || user?.mobile || user?.username || "").trim();
}

function userOptionLabel(user) {
  const name = user?.name || user?.username || user?.email || user?.mobile || "Unnamed user";
  const contact = userContact(user);
  return contact ? `${name} - ${contact}` : name;
}

function roleAssignmentUsers(users) {
  const namesWithEmail = new Set(
    users
      .filter(user => String(user?.email || "").trim())
      .map(userNameKey)
      .filter(Boolean)
  );
  const seen = new Set();

  return users.filter(user => {
    const contact = userContact(user);
    const nameKey = userNameKey(user);
    const email = String(user?.email || "").trim();
    if (!contact) return false;
    if (!email && nameKey && namesWithEmail.has(nameKey)) return false;

    const uniqueKey = email
      ? `email:${email.toLowerCase()}`
      : `contact:${contact.toLowerCase()}`;
    if (seen.has(uniqueKey)) return false;
    seen.add(uniqueKey);
    return true;
  });
}

function saveReportsExcel(results, suitesById, reportType) {
  const wb = XLSX.utils.book_new();
  const summaryHeaders = ["Test Name", "Candidate", "Email", "Project/Department", "Designation", "Score", "Percentage", "Result", "Submitted At"];
  const summaryRows = results.map(result => [
    resultTestName(result, suitesById),
    candidateName(result),
    candidateEmail(result),
    result.project || "-",
    result.designation || "-",
    `${result.score || 0}/${result.totalMarks || 0}`,
    `${resultPct(result)}%`,
    resultStatus(result),
    result.submittedAt ? new Date(result.submittedAt).toLocaleString() : "-",
  ]);
  const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
  summarySheet["!cols"] = summaryHeaders.map(header => ({ wch: Math.max(16, header.length + 4) }));
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  if (reportType === "descriptive") {
    const categoryHeaders = ["Test Name", "Candidate", "Email", "Category", "Score", "Total", "Percentage"];
    const categoryRows = [];
    results.forEach(result => {
      const rows = Array.isArray(result.categoryResults) && result.categoryResults.length
        ? result.categoryResults
        : [{ category: "Overall", score: result.score || 0, total: result.totalMarks || 0, percentage: resultPct(result) }];
      rows.forEach(row => {
        categoryRows.push([
          resultTestName(result, suitesById),
          candidateName(result),
          candidateEmail(result),
          row.category || "Overall",
          row.score ?? row.earnedMarks ?? 0,
          row.total ?? 0,
          `${row.percentage ?? 0}%`,
        ]);
      });
    });
    const categorySheet = XLSX.utils.aoa_to_sheet([categoryHeaders, ...categoryRows]);
    categorySheet["!cols"] = categoryHeaders.map(header => ({ wch: Math.max(16, header.length + 4) }));
    XLSX.utils.book_append_sheet(wb, categorySheet, "Category Detail");
  }

  XLSX.writeFile(wb, `${reportType}_superadmin_results_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function saveReportsPDF(results, suitesById, reportType) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const title = reportType === "descriptive" ? "Super Admin Descriptive Results" : "Super Admin Summary Results";
  doc.setFillColor(26, 61, 40);
  doc.rect(0, 0, 297, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString(), 283, 14, { align: "right" });

  autoTable(doc, {
    startY: 30,
    head: [["#", "Test Name", "Candidate", "Email", "Project/Department", "Designation", "Score", "%", "Result", "Date"]],
    body: results.map((result, index) => [
      index + 1,
      resultTestName(result, suitesById),
      candidateName(result),
      candidateEmail(result),
      result.project || "-",
      result.designation || "-",
      `${result.score || 0}/${result.totalMarks || 0}`,
      `${resultPct(result)}%`,
      resultStatus(result),
      result.submittedAt ? new Date(result.submittedAt).toLocaleDateString() : "-",
    ]),
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [26, 61, 40], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 247, 244] },
  });

  if (reportType === "descriptive") {
    results.forEach((result, index) => {
      doc.addPage("a4", "landscape");
      doc.setTextColor(26, 61, 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`${index + 1}. ${candidateName(result)} - ${resultTestName(result, suitesById)}`, 14, 16);
      autoTable(doc, {
        startY: 24,
        head: [["Category", "Score", "Total", "Percentage"]],
        body: (Array.isArray(result.categoryResults) && result.categoryResults.length
          ? result.categoryResults
          : [{ category: "Overall", score: result.score || 0, total: result.totalMarks || 0, percentage: resultPct(result) }]
        ).map(row => [
          row.category || "Overall",
          row.score ?? row.earnedMarks ?? 0,
          row.total ?? 0,
          `${row.percentage ?? 0}%`,
        ]),
        headStyles: { fillColor: [26, 61, 40], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2.5 },
      });
    });
  }

  doc.save(`${reportType}_superadmin_results_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function SuperAdmin() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeNav, setActiveNav] = useState("dashboard");
  const [reportResults, setReportResults] = useState([]);
  const [suitesById, setSuitesById] = useState({});
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [controlMode, setControlMode] = useState("rights");
  const [roles, setRoles] = useState([
    { name: "candidate", baseRole: "candidate", system: true },
    { name: "admin", baseRole: "admin", system: true },
    { name: "superadmin", baseRole: "admin", system: true },
    ...readLocalRoles(),
  ]);
  const [createUserForm, setCreateUserForm] = useState(emptyCreateUserForm);
  const [creatingUser, setCreatingUser] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: "", baseRole: "candidate", description: "" });
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState("candidate");
  const [orgOptions, setOrgOptions] = useState(defaultOrgOptions);
  const [projectName, setProjectName] = useState("");
  const [departmentProject, setDepartmentProject] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [rightsUserId, setRightsUserId] = useState("");
  const [rightsForm, setRightsForm] = useState(() => normalizeRights());
  const [rightsSaving, setRightsSaving] = useState(false);

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

  useEffect(() => {
    if (activeNav !== "reports") return;
    let ignore = false;
    const fetchReports = async () => {
      setReportsLoading(true);
      try {
        const headers = getAuthHeaders();
        const [resultsRes, suitesRes] = await Promise.all([
          axios.get(`${API_BASE}/results/all`, { headers }),
          axios.get(`${API_BASE}/test-suites`, { headers }),
        ]);
        if (ignore) return;
        setReportResults(resultsRes.data);
        const nextSuites = {};
        suitesRes.data.forEach(suite => { nextSuites[suite._id] = suite.name; });
        setSuitesById(nextSuites);
      } catch (err) {
        if (!ignore) setError(err.response?.data?.message || "Unable to load reports");
      } finally {
        if (!ignore) setReportsLoading(false);
      }
    };
    fetchReports();
    return () => { ignore = true; };
  }, [activeNav]);

  useEffect(() => {
    if (activeNav !== "management") return;
    const headers = getAuthHeaders();
    axios.get(`${API_URL}/superadmin/roles`, { headers })
      .then(res => setRoles(res.data))
      .catch(() => setRoles(prev => [...prev.filter(role => role.system), ...readLocalRoles()]));
    axios.get(`${API_URL}/org-options`, { headers })
      .then(res => setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data))))
      .catch(() => setOrgOptions(defaultOrgOptions()));
  }, [activeNav]);

  const updateAccess = async (userId, isActive) => {
    try {
      await axios.put(
        `${API_URL}/superadmin/users/${userId}/access`,
        { isActive },
        { headers: getAuthHeaders() }
      );
      await fetchOverview();
    } catch (err) {
      alert(err.response?.data?.message || "Unable to update user access");
    }
  };

  const updateCreateUserForm = (field, value) => {
    setCreateUserForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === "project" ? { designation: "" } : {}),
      ...(field === "contactType" ? { email: "", mobile: "" } : {}),
    }));
  };

  const createUserAccount = async () => {
    if (!createUserForm.name.trim()) return alert("Enter full name.");
    if (!createUserForm.username.trim()) return alert("Enter username.");
    if (createUserForm.contactType === "email" && (!createUserForm.email.trim() || !createUserForm.email.includes("@") || !createUserForm.email.includes("."))) {
      return alert("Enter a valid email address.");
    }
    if (createUserForm.contactType === "mobile" && createUserForm.mobile.replace(/\D/g, "").length < 10) {
      return alert("Enter a valid mobile number.");
    }
    if (!createUserForm.password || createUserForm.password.length < 6) return alert("Password must be at least 6 characters.");
    if (!createUserForm.age || Number(createUserForm.age) < 10 || Number(createUserForm.age) > 100) return alert("Enter a valid age between 10 and 100.");
    if (!createUserForm.gender) return alert("Select gender.");
    if (!createUserForm.project) return alert("Select project/department.");
    if (!createUserForm.designation) return alert("Select designation.");

    setCreatingUser(true);
    try {
      const payload = {
        name: createUserForm.name.trim(),
        username: createUserForm.username.trim(),
        email: createUserForm.contactType === "email" ? createUserForm.email.trim().toLowerCase() : "",
        mobile: createUserForm.contactType === "mobile" ? createUserForm.mobile.trim() : "",
        password: createUserForm.password,
        role: createUserForm.role,
        age: createUserForm.age ? Number(createUserForm.age) : "",
        gender: createUserForm.gender,
        project: createUserForm.project,
        designation: createUserForm.designation,
      };
      const res = await axios.post(`${API_URL}/superadmin/users`, payload, { headers: getAuthHeaders() });
      setUsers(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setStats(prev => ({
        ...prev,
        totalUsers: prev.totalUsers + 1,
        activeUsers: prev.activeUsers + 1,
        administrators: ["admin", "superadmin"].includes(res.data.role) ? prev.administrators + 1 : prev.administrators,
      }));
      setCreateUserForm(emptyCreateUserForm);
      alert("User created successfully.");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to create user.");
    } finally {
      setCreatingUser(false);
    }
  };

  const createRole = async () => {
    const name = roleForm.name.trim();
    if (!name) return alert("Enter a role name.");
    const payload = { ...roleForm, name };
    try {
      const res = await axios.post(`${API_URL}/superadmin/roles`, payload, { headers: getAuthHeaders() });
      setRoles(prev => [...prev, { ...res.data, system: false }]);
      setRoleForm({ name: "", baseRole: "candidate", description: "" });
    } catch (err) {
      if (err.response?.status === 404) {
        const nextRole = { ...payload, system: false };
        const nextRoles = [...readLocalRoles().filter(role => role.name.toLowerCase() !== name.toLowerCase()), nextRole];
        writeLocalRoles(nextRoles);
        setRoles(prev => [...prev.filter(role => role.system), ...nextRoles]);
        setRoleForm({ name: "", baseRole: "candidate", description: "" });
        alert("Role saved locally. Redeploy Railway backend to save roles for all admins.");
      } else {
        alert(err.response?.data?.message || "Unable to create role");
      }
    }
  };

  const assignUserRole = async () => {
    if (!assignUserId || !assignRole) return alert("Select a user and role.");
    try {
      const res = await axios.put(
        `${API_URL}/superadmin/users/${assignUserId}/role`,
        { role: assignRole },
        { headers: getAuthHeaders() }
      );
      setUsers(prev => prev.map(user => user._id === res.data._id ? res.data : user));
      setAssignUserId("");
      setAssignRole("candidate");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to assign role. Railway backend may need redeploy.");
    }
  };

  const handleRightsUserChange = (userId) => {
    setRightsUserId(userId);
    const selected = users.find(user => user._id === userId);
    setRightsForm(normalizeRights(selected));
  };

  const setRightsProject = (project) => {
    setRightsForm(prev => ({
      ...prev,
      scopeProjects: project ? [project] : [],
      scopeDepartments: [],
    }));
  };

  const toggleRightsDepartment = (department) => {
    setRightsForm(prev => {
      const selected = prev.scopeDepartments.includes(department);
      return {
        ...prev,
        scopeDepartments: selected
          ? prev.scopeDepartments.filter(item => item !== department)
          : [...prev.scopeDepartments, department],
      };
    });
  };

  const toggleRight = (key) => {
    setRightsForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  };

  const saveAdminRights = async () => {
    if (!rightsUserId) return alert("Select an admin first.");
    setRightsSaving(true);
    try {
      const res = await axios.put(
        `${API_URL}/superadmin/users/${rightsUserId}/permissions`,
        rightsForm,
        { headers: getAuthHeaders() }
      );
      setUsers(prev => prev.map(user => user._id === res.data._id ? res.data : user));
      alert("Admin rights saved.");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to save admin rights.");
    } finally {
      setRightsSaving(false);
    }
  };

  const openResetPassword = (user) => {
    setResetUser(user);
    setResetPassword("");
  };

  const resetUserPassword = async () => {
    if (!resetUser) return;
    if (resetPassword.length < 6) return alert("Temporary password must be at least 6 characters.");

    setResetSaving(true);
    try {
      const res = await axios.put(
        `${API_URL}/superadmin/users/${resetUser._id}/password`,
        { password: resetPassword },
        { headers: getAuthHeaders() }
      );
      setUsers(prev => prev.map(user => user._id === res.data.user._id ? res.data.user : user));
      setResetUser(null);
      setResetPassword("");
      alert("Password reset successfully. Share the temporary password securely with the user.");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to reset password. Railway backend may need redeploy.");
    } finally {
      setResetSaving(false);
    }
  };

  const deleteUserAccount = async (targetUser) => {
    if (!targetUser?._id) return;
    if (targetUser._id === currentUser?._id) {
      return alert("You cannot delete your own account.");
    }

    const contact = targetUser.email || targetUser.mobile || targetUser.username || "no contact";
    const confirmation = window.prompt(
      `Delete user ${targetUser.name || "this user"} (${contact})?\n\nThis removes their login account. Type DELETE to confirm.`
    );
    if (confirmation !== "DELETE") return;

    try {
      const res = await axios.delete(`${API_URL}/superadmin/users/${targetUser._id}`, {
        headers: getAuthHeaders(),
      });
      setUsers(prev => prev.filter(user => user._id !== targetUser._id));
      if (assignUserId === targetUser._id) setAssignUserId("");
      if (rightsUserId === targetUser._id) {
        setRightsUserId("");
        setRightsForm(normalizeRights());
      }
      if (resetUser?._id === targetUser._id) {
        setResetUser(null);
        setResetPassword("");
      }
      alert(res.data?.message || "User deleted successfully.");
    } catch (err) {
      alert(err.response?.data?.message || "Unable to delete user.");
    }
  };

  const saveProjectLocal = (name) => {
    const nextOptions = mergeOrgOptions(orgOptions, { [name]: [] });
    writeLocalOrgOptions(nextOptions);
    setOrgOptions(nextOptions);
  };

  const addProject = async () => {
    const name = projectName.trim();
    if (!name) return alert("Enter a project/department name.");
    try {
      const res = await axios.post(`${API_URL}/superadmin/org-options/projects`, { name }, { headers: getAuthHeaders() });
      setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data)));
    } catch {
      saveProjectLocal(name);
      alert("Project saved locally. Redeploy Railway backend to save it for everyone.");
    }
    setProjectName("");
  };

  const addDepartment = async () => {
    const project = departmentProject.trim();
    const department = departmentName.trim();
    if (!project || !department) return alert("Select a project/department and enter a designation.");
    try {
      const res = await axios.post(`${API_URL}/superadmin/org-options/departments`, { project, department }, { headers: getAuthHeaders() });
      setOrgOptions(mergeOrgOptions(defaultOrgOptions(), readLocalOrgOptions(), apiProjectsToMap(res.data)));
    } catch {
      const nextOptions = mergeOrgOptions(orgOptions, { [project]: [...(orgOptions[project] || []), department] });
      writeLocalOrgOptions(nextOptions);
      setOrgOptions(nextOptions);
      alert("Designation saved locally. Redeploy Railway backend to save it for everyone.");
    }
    setDepartmentName("");
  };

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  const displayUsers = roleAssignmentUsers(users);
  const displayStats = {
    totalUsers: displayUsers.length,
    activeUsers: displayUsers.filter(user => user.isActive !== false).length,
    administrators: displayUsers.filter(user => user.role === "admin" || user.role === "superadmin").length,
    totalAssessments: stats.totalAssessments,
  };

  const getFilteredUsers = () => {
    let base = displayUsers;
    if (activeNav === "Candidates") base = displayUsers.filter(u => u.role === "candidate");
    if (activeNav === "administrators") base = displayUsers.filter(u => u.role === "admin" || u.role === "superadmin");
    return base.filter(u =>
      `${u.name} ${u.email} ${u.mobile} ${u.username} ${u.role} ${u.customRole || ""}`.toLowerCase().includes(search.toLowerCase())
    );
  };

  const filteredUsers = getFilteredUsers();
  const filteredReports = reportResults.filter(result =>
    [
      resultTestName(result, suitesById),
      candidateName(result),
      candidateEmail(result),
      result.project,
      result.designation,
    ].join(" ").toLowerCase().includes(reportSearch.toLowerCase())
  );
  const adminUsers = displayUsers.filter(user => user.role === "admin" || user.role === "superadmin");
  const selectedRightsUser = users.find(user => user._id === rightsUserId);
  const rightsProject = rightsForm.scopeProjects[0] || "";
  const rightsDepartments = rightsProject
    ? (orgOptions[rightsProject] || [])
    : [];
  const createUserProjectNames = Object.keys(orgOptions).sort((a, b) => a.localeCompare(b));
  const createUserDepartments = createUserForm.project ? orgOptions[createUserForm.project] || [] : [];
  const assignableRoles = roles.filter(role => role.name !== "superadmin");
  const roleUsers = displayUsers;

  const getSectionTitle = () => {
    if (activeNav === "Candidates") return "Candidates";
    if (activeNav === "administrators") return "Administrators";
    if (activeNav === "reports") return "Reports";
    if (activeNav === "management") return "Controls";
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
          <button
            type="button"
            className={activeNav === "dashboard" ? "active" : ""}
            onClick={() => { setActiveNav("dashboard"); setSearch(""); }}
          >
            🏠 Dashboard
          </button>
          <button
            type="button"
            className={activeNav === "Candidates" ? "active" : ""}
            onClick={() => { setActiveNav("Candidates"); setSearch(""); }}
          >
            🎓 Candidates
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
            className={activeNav === "management" ? "active" : ""}
            onClick={() => { setActiveNav("management"); setSearch(""); }}
          >
            🧩 Controls
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

        {activeNav === "dashboard" && (
          <section className="welcome-card">
            <div>
              <h1>Welcome Back, Super Admin</h1>
              <p>Manage users, administrators and monitor assessment activities.</p>
            </div>
          </section>
        )}

        {activeNav === "dashboard" && (
          <section className="stats-grid">
            <div className="stat-card" onClick={() => setActiveNav("Candidates")} style={{ cursor: "pointer" }}>
              <h3>Total Users</h3>
              <h2>{displayStats.totalUsers}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>Click to view →</p>
            </div>
            <div className="stat-card" onClick={() => setActiveNav("Candidates")} style={{ cursor: "pointer" }}>
              <h3>Active Users</h3>
              <h2>{displayStats.activeUsers}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>Click to view →</p>
            </div>
            <div className="stat-card" onClick={() => setActiveNav("administrators")} style={{ cursor: "pointer" }}>
              <h3>Administrators</h3>
              <h2>{displayStats.administrators}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>Click to view →</p>
            </div>
            <div className="stat-card">
              <h3>Assessments</h3>
              {/* ✅ Fixed: backend returns totalAssessments not assessments */}
              <h2>{displayStats.totalAssessments}</h2>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>Total submitted</p>
            </div>
          </section>
        )}

        {activeNav === "reports" && (
          <section className="card">
            <div className="section-header">
              <h2>📊 Reports</h2>
              <input
                type="text"
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                placeholder="Search reports..."
              />
            </div>

            <div className="report-toolbar">
              <div>
                <h3>{filteredReports.length}</h3>
                <p>submissions shown</p>
              </div>
              <div className="report-actions">
                <button type="button" onClick={() => saveReportsPDF(filteredReports, suitesById, "summary")}>Summary PDF</button>
                <button type="button" onClick={() => saveReportsExcel(filteredReports, suitesById, "summary")}>Summary Excel</button>
                <button type="button" onClick={() => saveReportsPDF(filteredReports, suitesById, "descriptive")}>Descriptive PDF</button>
                <button type="button" onClick={() => saveReportsExcel(filteredReports, suitesById, "descriptive")}>Descriptive Excel</button>
              </div>
            </div>

            {reportsLoading ? (
              <p className="empty-message">Loading reports...</p>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Test Name</th>
                      <th>Candidate</th>
                      <th>Email</th>
                      <th>Project/Department</th>
                      <th>Designation</th>
                      <th>Score</th>
                      <th>%</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map(result => (
                      <tr key={result._id}>
                        <td>{resultTestName(result, suitesById)}</td>
                        <td>{candidateName(result)}</td>
                        <td>{candidateEmail(result)}</td>
                        <td>{result.project || "-"}</td>
                        <td>{result.designation || "-"}</td>
                        <td>{result.score || 0}/{result.totalMarks || 0}</td>
                        <td>{resultPct(result)}%</td>
                        <td>
                          <span className={`badge ${resultStatus(result) === "Pass" ? "active" : "disabled"}`}>
                            {resultStatus(result)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredReports.length === 0 && <p className="empty-message">No reports found.</p>}
              </div>
            )}
          </section>
        )}

        {activeNav === "settings" && (
          <section className="card">
            <div className="section-header">
              <h2>⚙️ Settings</h2>
            </div>
            <div style={{ textAlign: "center", padding: "60px 0", color: "#888" }}>
              <div style={{ fontSize: "60px", marginBottom: "20px" }}>⚙️</div>
              <h3 style={{ fontSize: "22px", color: "#2d5d50", marginBottom: "10px" }}>Exam Settings</h3>
              <p style={{ color: "#aaa", marginBottom: "24px" }}>Configure exam duration and question limits</p>
              <button
                onClick={() => navigate("/settings")}
                style={{
                  padding: "12px 30px",
                  background: "linear-gradient(135deg, #1f4037, #2c7744)",
                  color: "white", border: "none", borderRadius: "12px",
                  fontSize: "16px", cursor: "pointer",
                }}
              >
                Go to Exam Settings →
              </button>
            </div>
          </section>
        )}

        {activeNav === "management" && (
          <section className="card controls-card">
            <div className="section-header">
              <h2>🧩 Controls</h2>
            </div>

            <div className="control-tabs" role="tablist" aria-label="Super admin controls">
              {CONTROL_MODES.map(mode => (
                <button
                  key={mode.key}
                  type="button"
                  role="tab"
                  aria-selected={controlMode === mode.key}
                  className={controlMode === mode.key ? "active" : ""}
                  onClick={() => setControlMode(mode.key)}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {controlMode === "rights" && (
              <div className="rights-console">
                <div className="rights-filters">
                  <select value={rightsUserId} onChange={e => handleRightsUserChange(e.target.value)}>
                    <option value="">Select admin</option>
                    {adminUsers.map(user => (
                      <option key={user._id} value={user._id}>
                        {user.name} - {user.customRole || user.role}
                      </option>
                    ))}
                  </select>
                  <select value={rightsProject} onChange={e => setRightsProject(e.target.value)}>
                    <option value="">All project/departments</option>
                    {Object.keys(orgOptions).sort((a, b) => a.localeCompare(b)).map(project => (
                      <option key={project} value={project}>{project}</option>
                    ))}
                  </select>
                  <button type="button" onClick={saveAdminRights} disabled={rightsSaving || !rightsUserId}>
                    {rightsSaving ? "Saving..." : "Save Rights"}
                  </button>
                </div>

                {selectedRightsUser && (
                  <div className="rights-scope-card">
                    <div>
                      <strong>{selectedRightsUser.name}</strong>
                      <span>{selectedRightsUser.email || selectedRightsUser.mobile || selectedRightsUser.username}</span>
                    </div>
                    <p>
                      Project/Department scope: {rightsProject || "All project/departments"} · Designation scope: {rightsForm.scopeDepartments.length ? rightsForm.scopeDepartments.join(", ") : "All designations"}
                    </p>
                  </div>
                )}

                {rightsProject && (
                  <div className="rights-departments">
                    <span>Designations</span>
                    {rightsDepartments.length === 0 ? (
                      <p>No designations found for this project/department.</p>
                    ) : rightsDepartments.map(department => (
                      <button
                        key={department}
                        type="button"
                        className={rightsForm.scopeDepartments.includes(department) ? "selected" : ""}
                        onClick={() => toggleRightsDepartment(department)}
                      >
                        {rightsForm.scopeDepartments.includes(department) ? "✓" : "×"} {department}
                      </button>
                    ))}
                  </div>
                )}

                <div className="rights-table-wrap">
                  <table className="rights-table">
                    <thead>
                      <tr>
                        <th>Feature</th>
                        <th>Details</th>
                        <th>Allowed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ADMIN_RIGHTS.map(right => {
                        const allowed = rightsForm.permissions[right.key] !== false;
                        return (
                          <tr key={right.key}>
                            <td>{right.label}</td>
                            <td>{right.detail}</td>
                            <td>
                              <button
                                type="button"
                                className={`rights-toggle ${allowed ? "allowed" : "blocked"}`}
                                onClick={() => toggleRight(right.key)}
                                disabled={!rightsUserId}
                                title={allowed ? "Allowed" : "Blocked"}
                              >
                                {allowed ? "✓" : "×"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {controlMode === "roles" && (
              <div className="control-grid">
                <div className="control-panel wide">
                  <h3>Create User Account</h3>
                  <div className="control-form-grid">
                    <input
                      value={createUserForm.name}
                      onChange={e => updateCreateUserForm("name", e.target.value)}
                      placeholder="Full name"
                    />
                    <input
                      value={createUserForm.username}
                      onChange={e => updateCreateUserForm("username", e.target.value)}
                      placeholder="Username"
                    />
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={createUserForm.age}
                      onChange={e => updateCreateUserForm("age", e.target.value)}
                      placeholder="Age"
                    />
                    <select value={createUserForm.gender} onChange={e => updateCreateUserForm("gender", e.target.value)}>
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                    <select value={createUserForm.project} onChange={e => updateCreateUserForm("project", e.target.value)}>
                      <option value="">Select project/department</option>
                      {createUserProjectNames.map(project => (
                        <option key={project} value={project}>{project}</option>
                      ))}
                    </select>
                    <select
                      value={createUserForm.designation}
                      onChange={e => updateCreateUserForm("designation", e.target.value)}
                      disabled={!createUserForm.project}
                    >
                      <option value="">{createUserForm.project ? "Select designation" : "Select project/department first"}</option>
                      {createUserDepartments.map(department => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                    <select value={createUserForm.contactType} onChange={e => updateCreateUserForm("contactType", e.target.value)}>
                      <option value="email">Use email</option>
                      <option value="mobile">Use mobile number</option>
                    </select>
                    {createUserForm.contactType === "email" ? (
                      <input
                        type="email"
                        value={createUserForm.email}
                        onChange={e => updateCreateUserForm("email", e.target.value)}
                        placeholder="Email address"
                      />
                    ) : (
                      <input
                        type="tel"
                        value={createUserForm.mobile}
                        onChange={e => updateCreateUserForm("mobile", e.target.value)}
                        placeholder="Mobile number"
                      />
                    )}
                    <input
                      type="password"
                      value={createUserForm.password}
                      onChange={e => updateCreateUserForm("password", e.target.value)}
                      placeholder="Temporary password"
                    />
                    <select value={createUserForm.role} onChange={e => updateCreateUserForm("role", e.target.value)}>
                      {assignableRoles.map(role => (
                        <option key={role.name} value={role.name}>
                          {role.name}{role.system ? " (system)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={createUserAccount} disabled={creatingUser}>
                    {creatingUser ? "Creating..." : "Create User"}
                  </button>
                </div>

                <div className="control-panel">
                  <h3>Create New Role</h3>
                  <input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="Role name" />
                  <select value={roleForm.baseRole} onChange={e => setRoleForm({ ...roleForm, baseRole: e.target.value })}>
                    <option value="candidate">Candidate-level access</option>
                    <option value="admin">Admin-level access</option>
                  </select>
                  <textarea value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="Role description" rows={3} />
                  <button type="button" onClick={createRole}>Create Role</button>
                </div>

                <div className="control-panel">
                  <h3>Add People To Role</h3>
                  <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
                    <option value="">Select user</option>
                    {roleUsers.map(user => (
                      <option key={user._id} value={user._id}>
                        {userOptionLabel(user)}
                      </option>
                    ))}
                  </select>
                  <select value={assignRole} onChange={e => setAssignRole(e.target.value)}>
                    {assignableRoles.map(role => <option key={role.name} value={role.name}>{role.name}</option>)}
                  </select>
                  <button type="button" onClick={assignUserRole}>Assign Role</button>
                  <div className="mini-list">
                    {assignableRoles.map(role => (
                      <span key={role.name}>{role.name}{role.system ? " (system)" : ""}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {controlMode === "org" && (
              <div className="control-grid">
                <div className="control-panel">
                  <h3>Add Project/Department</h3>
                  <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Project/Department name" />
                  <button type="button" onClick={addProject}>Add Project/Department</button>
                </div>

                <div className="control-panel">
                  <h3>Add Designation</h3>
                  <select value={departmentProject} onChange={e => setDepartmentProject(e.target.value)}>
                    <option value="">Select project/department</option>
                    {Object.keys(orgOptions).sort((a, b) => a.localeCompare(b)).map(project => (
                      <option key={project} value={project}>{project}</option>
                    ))}
                  </select>
                  <input value={departmentName} onChange={e => setDepartmentName(e.target.value)} placeholder="Designation name" />
                  <button type="button" onClick={addDepartment}>Add Designation</button>
                </div>

                <div className="control-panel wide">
                  <h3>Current Project/Departments</h3>
                  <div className="project-list">
                    {Object.entries(orgOptions).sort(([a], [b]) => a.localeCompare(b)).map(([project, departments]) => (
                      <details key={project}>
                        <summary>{project} <span>{departments.length} designations</span></summary>
                        <div>{departments.map(dept => <span key={dept}>{dept}</span>)}</div>
                      </details>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {controlMode === "mail" && <BulkMailPanel />}
          </section>
        )}

        {(activeNav === "dashboard" || activeNav === "Candidates" || activeNav === "administrators") && (
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user._id}>
                      <td>{user.name}</td>
                      <td>{user.email || user.mobile || user.username || "—"}</td>
                      <td>
                        <span className={`badge ${user.role === "candidate" ? "Candidate" : "admin"}`}>
                          {user.customRole || user.role}
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
                      <td>
                        <div className="user-actions">
                          <button
                            type="button"
                            className="small-action-btn"
                            onClick={() => openResetPassword(user)}
                          >
                            Reset Password
                          </button>
                          <button
                            type="button"
                            className="small-action-btn danger"
                            onClick={() => deleteUserAccount(user)}
                            disabled={user._id === currentUser?._id}
                            title={user._id === currentUser?._id ? "You cannot delete your own account" : "Delete user"}
                          >
                            Delete User
                          </button>
                        </div>
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

      {resetUser && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
            <h2 id="reset-password-title">Reset Password</h2>
            <p>
              Set a temporary password for <strong>{resetUser.name}</strong>
              <span>{resetUser.email}</span>
            </p>
            <label htmlFor="temporary-password">Temporary password</label>
            <input
              id="temporary-password"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              autoFocus
            />
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setResetUser(null)}>
                Cancel
              </button>
              <button type="button" onClick={resetUserPassword} disabled={resetSaving}>
                {resetSaving ? "Saving..." : "Save Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdmin;
