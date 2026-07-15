function suiteUserId(user) {
  return String(user?.id || user?._id || "");
}

function assignedUserId(entry) {
  return String(entry?._id || entry?.user?._id || entry?.user || entry || "");
}

function isWithinAvailabilityWindow(suite, now = new Date()) {
  const currentTime = now.getTime();
  const startTime = suite?.startDate ? new Date(suite.startDate).getTime() : null;
  const endTime = suite?.endDate ? new Date(suite.endDate).getTime() : null;
  if (Number.isFinite(startTime) && currentTime < startTime) return false;
  if (Number.isFinite(endTime) && currentTime > endTime) return false;
  return true;
}

function canAccessSuite(suite, user) {
  if (!suite || suite.deletedAt) return false;
  if (user && user.role !== "candidate") return true;
  if (suite.status !== "active" || !isWithinAvailabilityWindow(suite)) return false;
  if (!user) return suite.isPublic !== false;
  if (suite.isPublic !== false) return true;
  const userId = suiteUserId(user);
  return Boolean(userId) && (suite.assignedUsers || []).some(entry => assignedUserId(entry) === userId);
}

module.exports = { canAccessSuite, isWithinAvailabilityWindow };
