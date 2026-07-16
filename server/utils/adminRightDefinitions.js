const {
  ADMIN_PERMISSION_DEFAULTS,
  ADMIN_PERMISSION_LABELS,
} = require("./adminPermissions");

// Legacy browser-created keys could be 81 characters long. New keys stay capped
// at 80 characters, but the extra character keeps old saved rights discoverable.
const CUSTOM_RIGHT_KEY_RE = /^custom_[a-z0-9_]{1,74}$/;
const RIGHT_LABEL_MAX_LENGTH = 80;
const RIGHT_DETAIL_MAX_LENGTH = 240;

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function makeCustomRightKey(label) {
  const slug = String(label || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 73);
  if (!slug) throw validationError("Enter a valid right name.");
  return `custom_${slug}`;
}

function normalizeCustomRightInput(input = {}) {
  if (typeof input.label !== "string") {
    throw validationError("Right name is required.");
  }
  if (input.detail !== undefined && typeof input.detail !== "string") {
    throw validationError("Right details must be plain text.");
  }

  const label = input.label.trim();
  const detail = String(input.detail || "").trim();
  if (!label) throw validationError("Right name is required.");
  if (label.length > RIGHT_LABEL_MAX_LENGTH) {
    throw validationError(`Right name cannot exceed ${RIGHT_LABEL_MAX_LENGTH} characters.`);
  }
  if (detail.length > RIGHT_DETAIL_MAX_LENGTH) {
    throw validationError(`Right details cannot exceed ${RIGHT_DETAIL_MAX_LENGTH} characters.`);
  }

  return {
    key: makeCustomRightKey(label),
    label,
    detail: detail || "Custom right created by superadmin",
  };
}

function isBuiltInRightKey(key) {
  return Object.prototype.hasOwnProperty.call(
    ADMIN_PERMISSION_DEFAULTS,
    String(key || "")
  );
}

function isCustomRightKey(key) {
  return CUSTOM_RIGHT_KEY_RE.test(String(key || ""));
}

function builtInRightDefinitions() {
  return ADMIN_PERMISSION_LABELS.map(right => ({
    ...right,
    system: true,
    custom: false,
  }));
}

function customRightDefinition(right, overrides = {}) {
  return {
    _id: right?._id || "",
    key: String(right?.key || ""),
    label: String(right?.label || ""),
    detail: String(right?.detail || "Custom right created by superadmin"),
    system: false,
    custom: true,
    ...overrides,
  };
}

function labelFromCustomRightKey(key) {
  return String(key || "")
    .replace(/^custom_/, "")
    .split("_")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Custom right";
}

module.exports = {
  CUSTOM_RIGHT_KEY_RE,
  RIGHT_DETAIL_MAX_LENGTH,
  RIGHT_LABEL_MAX_LENGTH,
  builtInRightDefinitions,
  customRightDefinition,
  isBuiltInRightKey,
  isCustomRightKey,
  labelFromCustomRightKey,
  makeCustomRightKey,
  normalizeCustomRightInput,
};
