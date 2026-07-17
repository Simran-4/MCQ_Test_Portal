const API = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "token";
const USER_KEY = "user";

export function getAuthToken() {
  const token = sessionStorage.getItem(TOKEN_KEY) || "";
  if (!token) return "";
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export function setAuthSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, String(token || "").startsWith("Bearer ") ? token : `Bearer ${token}`);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  // Authentication used to be shared in localStorage, which caused any login
  // in another tab to replace the active account. Remove only legacy auth keys.
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function clearAuthSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  // Also remove a pre-session-storage login left by an older app version.
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
  canManageSettings: true,
  canBulkMail: true,
  canViewUsers: true,
};

export function getCurrentUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
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
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
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
  const permissions = getAdminPermissions(user).permissions;
  return Object.prototype.hasOwnProperty.call(ADMIN_PERMISSION_DEFAULTS, feature)
    ? permissions[feature] !== false
    : permissions[feature] === true;
}
