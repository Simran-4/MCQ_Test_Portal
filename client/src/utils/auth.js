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

export function getAdminPermissions(user = getCurrentUser()) {
  const raw = user.adminPermissions || {};
  const rawPermissions = raw.permissions || {};
  return {
    permissions: Object.keys(ADMIN_PERMISSION_DEFAULTS).reduce((acc, key) => {
      acc[key] = rawPermissions[key] === undefined
        ? ADMIN_PERMISSION_DEFAULTS[key]
        : Boolean(rawPermissions[key]);
      return acc;
    }, {}),
    scopeProjects: Array.isArray(raw.scopeProjects) ? raw.scopeProjects : [],
    scopeDepartments: Array.isArray(raw.scopeDepartments) ? raw.scopeDepartments : [],
  };
}

export function canAdmin(feature, user = getCurrentUser()) {
  if (user.role === "superadmin") return true;
  if (user.role !== "admin") return false;
  return getAdminPermissions(user).permissions[feature] !== false;
}
