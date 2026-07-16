const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ADMIN_PERMISSION_DEFAULTS,
  hasAdminPermission,
  normalizeAdminPermissions,
} = require("../utils/adminPermissions");
const {
  RIGHT_DETAIL_MAX_LENGTH,
  RIGHT_LABEL_MAX_LENGTH,
  builtInRightDefinitions,
  isBuiltInRightKey,
  isCustomRightKey,
  makeCustomRightKey,
  normalizeCustomRightInput,
} = require("../utils/adminRightDefinitions");

function adminWithPermissions(permissions = {}) {
  return {
    role: "admin",
    adminPermissions: {
      permissions,
      scopeProjects: [],
      scopeDepartments: [],
    },
  };
}

test("normalizes custom right labels into safe persistent keys", () => {
  assert.equal(makeCustomRightKey("  Download Candidate Photos  "), "custom_download_candidate_photos");
  assert.deepEqual(
    normalizeCustomRightInput({
      label: "  Review Certificates  ",
      detail: "  Can review generated certificates.  ",
    }),
    {
      key: "custom_review_certificates",
      label: "Review Certificates",
      detail: "Can review generated certificates.",
    }
  );
  assert.equal(isCustomRightKey("custom_review_certificates"), true);
  assert.equal(isCustomRightKey(`custom_${"x".repeat(74)}`), true);
  assert.equal(isCustomRightKey("canViewReports"), false);
});

test("rejects invalid or oversized custom right definitions", () => {
  assert.throws(
    () => normalizeCustomRightInput({ label: "   " }),
    error => error?.statusCode === 400
  );
  assert.throws(
    () => normalizeCustomRightInput({ label: "x".repeat(RIGHT_LABEL_MAX_LENGTH + 1) }),
    error => error?.statusCode === 400
  );
  assert.throws(
    () => normalizeCustomRightInput({
      label: "Valid",
      detail: "x".repeat(RIGHT_DETAIL_MAX_LENGTH + 1),
    }),
    error => error?.statusCode === 400
  );
});

test("built-in rights include settings access and are protected", () => {
  const rights = builtInRightDefinitions();
  assert.equal(ADMIN_PERMISSION_DEFAULTS.canManageSettings, true);
  assert.equal(isBuiltInRightKey("canManageSettings"), true);
  assert(rights.some(right =>
    right.key === "canManageSettings" &&
    right.system === true &&
    right.custom === false
  ));
});

test("built-in permissions retain legacy defaults while custom rights default to denied", () => {
  const admin = adminWithPermissions();
  assert.equal(hasAdminPermission(admin, "canViewReports"), true);
  assert.equal(hasAdminPermission(admin, "custom_review_certificates"), false);
  assert.equal(
    hasAdminPermission(adminWithPermissions({ custom_review_certificates: true }), "custom_review_certificates"),
    true
  );
  assert.equal(
    hasAdminPermission(adminWithPermissions({ custom_review_certificates: false }), "custom_review_certificates"),
    false
  );
  assert.equal(hasAdminPermission({ role: "superadmin" }, "custom_review_certificates"), true);
});

test("normalizing rights prevents manage access when view access is denied", () => {
  const access = normalizeAdminPermissions({
    permissions: {
      canViewSuites: false,
      canManageSuites: true,
      canViewQuestions: false,
      canManageQuestions: true,
    },
  });

  assert.equal(access.permissions.canViewSuites, false);
  assert.equal(access.permissions.canManageSuites, false);
  assert.equal(access.permissions.canViewQuestions, false);
  assert.equal(access.permissions.canManageQuestions, false);
});
