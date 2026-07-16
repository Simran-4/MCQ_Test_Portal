const ADMIN_PERMISSION_DEFAULTS = {
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

const ADMIN_PERMISSION_LABELS = [
  { key: "canViewReports", label: "View reports", detail: "Can open report pages and see result rows" },
  { key: "canViewTestReports", label: "View test reports", detail: "Can open statistical and descriptive test reports" },
  { key: "canDownloadReports", label: "Download reports", detail: "Can export summary and descriptive reports" },
  { key: "canViewSuites", label: "Open test suites", detail: "Can open test suite pages within scope" },
  { key: "canManageSuites", label: "Create / edit test suites", detail: "Can create, edit, activate, deactivate, and delete suites" },
  { key: "canViewQuestions", label: "View questions", detail: "Can see questions inside a test suite" },
  { key: "canManageQuestions", label: "Manage questions", detail: "Can add, import, edit, and delete questions" },
  { key: "canAssignTests", label: "Assign tests", detail: "Can assign test suites to candidates" },
  { key: "canManageSettings", label: "Manage settings", detail: "Can change assessment-wide settings" },
  { key: "canBulkMail", label: "Mail candidates", detail: "Can prepare bulk emails and certificate emails" },
  { key: "canViewUsers", label: "View users", detail: "Can see candidate and admin lists within scope" },
];

function cleanList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim())
    .filter(Boolean))];
}

function normalizeAdminPermissions(userOrPermissions = {}) {
  const raw = userOrPermissions.adminPermissions || userOrPermissions || {};
  const rawPermissions = raw.permissions instanceof Map
    ? Object.fromEntries(raw.permissions)
    : raw.permissions || {};
  const permissions = Object.keys(rawPermissions).reduce((acc, key) => {
    acc[key] = Boolean(rawPermissions[key]);
    return acc;
  }, {});
  Object.keys(ADMIN_PERMISSION_DEFAULTS).forEach((key) => {
    permissions[key] = rawPermissions[key] === undefined
      ? ADMIN_PERMISSION_DEFAULTS[key]
      : Boolean(rawPermissions[key]);
  });
  if (!permissions.canViewSuites) permissions.canManageSuites = false;
  if (permissions.canManageSuites) permissions.canViewSuites = true;
  if (!permissions.canViewQuestions) permissions.canManageQuestions = false;
  if (permissions.canManageQuestions) permissions.canViewQuestions = true;

  return {
    permissions,
    scopeProjects: cleanList(raw.scopeProjects),
    scopeDepartments: cleanList(raw.scopeDepartments),
  };
}

function hasAdminPermission(user, key) {
  if (user?.role === "superadmin") return true;
  if (user?.role !== "admin") return false;
  const permissions = normalizeAdminPermissions(user).permissions;
  return Object.prototype.hasOwnProperty.call(ADMIN_PERMISSION_DEFAULTS, key)
    ? permissions[key] !== false
    : permissions[key] === true;
}

function scopedResultQuery(user) {
  if (!user || user.role === "superadmin") return {};
  const access = normalizeAdminPermissions(user);
  const query = {};
  if (access.scopeProjects.length > 0) query.project = { $in: access.scopeProjects };
  if (access.scopeDepartments.length > 0) query.designation = { $in: access.scopeDepartments };
  return query;
}

function matchesUserScope(user, target) {
  if (!user || user.role === "superadmin") return true;
  const access = normalizeAdminPermissions(user);
  const projectOk = access.scopeProjects.length === 0 || access.scopeProjects.includes(target.project || "");
  const departmentOk = access.scopeDepartments.length === 0 || access.scopeDepartments.includes(target.designation || "");
  return projectOk && departmentOk;
}

module.exports = {
  ADMIN_PERMISSION_DEFAULTS,
  ADMIN_PERMISSION_LABELS,
  normalizeAdminPermissions,
  hasAdminPermission,
  scopedResultQuery,
  matchesUserScope,
};
