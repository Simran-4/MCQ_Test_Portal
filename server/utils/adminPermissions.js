const ADMIN_PERMISSION_DEFAULTS = {
  canViewReports: true,
  canDownloadReports: true,
  canManageSuites: true,
  canManageQuestions: true,
  canAssignTests: true,
  canManageSettings: true,
  canBulkMail: true,
  canViewUsers: true,
};

const ADMIN_PERMISSION_LABELS = [
  { key: "canViewReports", label: "View reports" },
  { key: "canDownloadReports", label: "Download reports" },
  { key: "canManageSuites", label: "Create / edit test suites" },
  { key: "canManageQuestions", label: "Add / import / delete questions" },
  { key: "canAssignTests", label: "Assign tests to candidates" },
  { key: "canManageSettings", label: "Change exam settings" },
  { key: "canBulkMail", label: "Send bulk mail" },
  { key: "canViewUsers", label: "See users" },
];

function cleanList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim())
    .filter(Boolean))];
}

function normalizeAdminPermissions(userOrPermissions = {}) {
  const raw = userOrPermissions.adminPermissions || userOrPermissions || {};
  const rawPermissions = raw.permissions || {};
  const permissions = Object.keys(ADMIN_PERMISSION_DEFAULTS).reduce((acc, key) => {
    acc[key] = rawPermissions[key] === undefined
      ? ADMIN_PERMISSION_DEFAULTS[key]
      : Boolean(rawPermissions[key]);
    return acc;
  }, {});

  return {
    permissions,
    scopeProjects: cleanList(raw.scopeProjects),
    scopeDepartments: cleanList(raw.scopeDepartments),
  };
}

function hasAdminPermission(user, key) {
  if (user?.role === "superadmin") return true;
  if (user?.role !== "admin") return false;
  return normalizeAdminPermissions(user).permissions[key] !== false;
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
