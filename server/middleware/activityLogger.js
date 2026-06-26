const ActivityLog = require("../models/ActivityLog");

const IGNORED_PATHS = new Set(["/api/auth/login", "/api/auth/validate-email", "/api/auth/forgot-password"]);

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
      action: `${req.method} ${req.path}`,
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
