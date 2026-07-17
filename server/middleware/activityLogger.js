const ActivityLog = require("../models/ActivityLog");

const IGNORED_PATHS = new Set([
  "/login",
  "/validate-email",
  "/forgot-password",
  "/forgot-password/verify-otp",
  "/forgot-password/reset",
  "/api/auth/login",
  "/api/auth/validate-email",
  "/api/auth/forgot-password",
  "/api/auth/forgot-password/verify-otp",
  "/api/auth/forgot-password/reset",
]);

function cleanRoute(path = "") {
  return String(path)
    .replace(/^\/+/, "")
    .replace(/^api\//, "")
    .replace(/^auth\//, "")
    .replace(/^test-suites?/, "test suite")
    .replace(/^questions?/, "question")
    .replace(/^results?/, "result")
    .replace(/^settings/, "settings");
}

function actionLabel(req) {
  const method = req.method;
  const path = String(req.path || "");
  const targetName = req.body?.name || req.body?.suiteName || req.body?.testName || "";

  if (path.includes("/superadmin/users/") && path.endsWith("/access")) {
    return req.body?.isActive === false ? "Disabled user account" : "Enabled user account";
  }
  if (path.includes("/superadmin/users/") && path.endsWith("/password")) return "Reset user password";
  if (path.includes("/superadmin/users/") && path.endsWith("/role")) return "Changed user role";
  if (path.includes("/superadmin/users/") && path.endsWith("/permissions")) return "Updated admin rights";
  if (path.includes("/superadmin/users")) {
    if (method === "POST") return "Created user account";
    if (method === "PUT" || method === "PATCH") return "Updated user account";
    if (method === "DELETE") return "Deleted user account";
  }
  if (path.includes("/superadmin/roles")) {
    if (method === "POST") return "Created role";
    if (method === "PUT" || method === "PATCH") return "Updated role";
    if (method === "DELETE") return "Deleted role";
  }
  if (path.includes("/org-options/projects")) {
    if (method === "POST") return `Added project/department${targetName ? `: ${targetName}` : ""}`;
    if (method === "PUT" || method === "PATCH") return `Renamed project/department${targetName ? ` to ${targetName}` : ""}`;
    if (method === "DELETE") return "Deleted project/department";
  }
  if (path.includes("/org-options/departments")) {
    if (method === "POST") return "Added designation";
    if (method === "PUT" || method === "PATCH") return "Renamed designation";
    if (method === "DELETE") return "Deleted designation";
  }
  if (path.includes("/permanent") && method === "DELETE") return "Permanently deleted test suite";
  if (path.includes("/suite/") && method === "DELETE") return "Deleted test results";
  if (path.includes("/test-suite") || path.includes("/test-suites")) {
    if (method === "POST") return "Created test suite";
    if (method === "PUT" || method === "PATCH") return "Updated test suite";
    if (method === "DELETE") return "Moved test suite to trash";
  }
  if (path.includes("/questions") && method === "DELETE") return "Deleted question";
  if (path.includes("/results") && method === "POST") return "Submitted test result";

  const verb = method === "POST" ? "Created" : method === "PUT" || method === "PATCH" ? "Updated" : method === "DELETE" ? "Deleted" : method;
  return `${verb} ${cleanRoute(path)}`.replace(/\s+/g, " ").trim();
}

function safeDetails(body) {
  if (!body || typeof body !== "object") return {};
  const copy = { ...body };
  ["password", "token", "authorization", "currentPassword"].forEach(key => delete copy[key]);
  return Object.fromEntries(Object.entries(copy).slice(0, 12));
}

function activityLogger(req, res, next) {
  res.on("finish", () => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    if (res.statusCode >= 400 || IGNORED_PATHS.has(req.path)) return;
    ActivityLog.create({
      actorId: String(req.user?.id || ""),
      actorName: req.currentUser?.name || req.body?.name || "System",
      actorRole: req.user?.role || "",
      action: actionLabel(req),
      method: req.method,
      path: req.path,
      targetId: String(req.params?.id || req.params?.suiteId || ""),
      details: safeDetails(req.body),
      occurredAt: new Date().toISOString(),
    }).catch(err => console.error("Activity log write failed:", err.message));
  });
  next();
}

module.exports = activityLogger;
