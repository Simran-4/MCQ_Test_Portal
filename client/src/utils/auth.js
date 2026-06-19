const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function getAuthToken() {
  const token = localStorage.getItem("token") || "";
  if (!token) return "";
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export function getAuthHeaders(extraHeaders = {}) {
  const authToken = getAuthToken();
  return authToken
    ? { ...extraHeaders, Authorization: authToken }
    : { ...extraHeaders };
}

export const ADMIN_PERMISSION_DEFAULTS = {
  canViewReports: true,
  canViewTestReports: true,
  canDownloadReports: true,
  canViewSuites: true,
  canManageSuites: true,
  canViewQuestions: true,
  canManageQuestions: true,
  canAssignTests: true,
  canBulkMail: true,
  canViewUsers: true,
};

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

export async function refreshCurrentUser() {
  const res = await fetch(`${API}/api/auth/me`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = new Error("Unable to refresh current user");
    err.status = res.status;
    throw err;
  }
  const user = await res.json();
  localStorage.setItem("user", JSON.stringify(user));
  return user;
}

export function getAdminPermissions(user = getCurrentUser()) {
  const raw = user.adminPermissions || {};
  const rawPermissions = raw.permissions || {};
  return {
    permissions: Object.keys(ADMIN_PERMISSION_DEFAULTS).reduce((acc, key) => {
      acc[key] = rawPermissions[key] === undefined
        ? ADMIN_PERMISSION_DEFAULTS[key]
        : Boolean(rawPermissions[key]);
      return acc;
    }, Object.keys(rawPermissions).reduce((acc, key) => {
      acc[key] = Boolean(rawPermissions[key]);
      return acc;
    }, {})),
    scopeProjects: Array.isArray(raw.scopeProjects) ? raw.scopeProjects : [],
    scopeDepartments: Array.isArray(raw.scopeDepartments) ? raw.scopeDepartments : [],
  };
}

export function canAdmin(feature, user = getCurrentUser()) {
  if (user.role === "superadmin") return true;
  if (user.role !== "admin") return false;
  return getAdminPermissions(user).permissions[feature] !== false;
}
