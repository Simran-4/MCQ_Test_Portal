function normalizeUsername(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, "");
}

function normalizeMobile(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function normalizeEmail(value) {
  return String(value || "").toLowerCase().trim();
}

function usersMatchingIdentifier(users, identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return [];

  const username = normalizeUsername(raw);
  const email = normalizeEmail(raw);
  const mobile = normalizeMobile(raw);
  const isEmail = raw.includes("@");
  const isMobile = !isEmail && /^\+?[\d\s().-]+$/.test(raw)
    && mobile.replace(/\D/g, "").length >= 10;

  return users.filter(user => {
    const matchesUsername = normalizeUsername(user.username) === username;
    if (isEmail) return normalizeEmail(user.email) === email || matchesUsername;
    if (isMobile) return normalizeMobile(user.mobile) === mobile || matchesUsername;
    return matchesUsername;
  });
}

module.exports = { normalizeUsername, normalizeMobile, normalizeEmail, usersMatchingIdentifier };
