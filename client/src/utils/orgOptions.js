import { PROJECT_DEPARTMENTS } from "../data/projectDepartments.js";

const STORAGE_KEY = "snehalaya_org_options";
const STORAGE_VALID_KEY = "snehalaya_org_options_valid";

function readStoredOrgOptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { valid: false, options: {} };
    const parsed = JSON.parse(raw);
    const valid = parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
      Object.entries(parsed).every(([project, departments]) =>
        project.trim() &&
        Array.isArray(departments) &&
        departments.every(department => typeof department === "string")
      );
    return valid ? { valid: true, options: parsed } : { valid: false, options: {} };
  } catch {
    return { valid: false, options: {} };
  }
}

export function readLocalOrgOptions() {
  return readStoredOrgOptions().options;
}

export function writeLocalOrgOptions(options) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    localStorage.setItem(STORAGE_VALID_KEY, "1");
  } catch {
    // The API remains authoritative when browser storage is unavailable.
  }
}

export function mergeOrgOptions(...sources) {
  const merged = {};
  sources.forEach(source => {
    Object.entries(source || {}).forEach(([project, departments]) => {
      if (!project) return;
      merged[project] = [
        ...new Set([
          ...(merged[project] || []),
          ...(Array.isArray(departments) ? departments : []),
        ]),
      ];
    });
  });
  return merged;
}

export function apiProjectsToMap(projects) {
  return (Array.isArray(projects) ? projects : []).reduce((acc, project) => {
    if (project?.name) acc[project.name] = Array.isArray(project.departments) ? project.departments : [];
    return acc;
  }, {});
}

export function syncApiOrgOptions(projects) {
  const options = apiProjectsToMap(projects);
  writeLocalOrgOptions(options);
  return options;
}

export function defaultOrgOptions() {
  const stored = readStoredOrgOptions();
  try {
    if (
      stored.valid &&
      (Object.keys(stored.options).length > 0 || localStorage.getItem(STORAGE_VALID_KEY) === "1")
    ) {
      return mergeOrgOptions(stored.options);
    }
  } catch {
    // Fall through to the bundled defaults.
  }
  return mergeOrgOptions(PROJECT_DEPARTMENTS);
}
