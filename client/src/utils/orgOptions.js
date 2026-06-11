import { PROJECT_DEPARTMENTS } from "../data/projectDepartments";

const STORAGE_KEY = "snehalaya_org_options";

export function readLocalOrgOptions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function writeLocalOrgOptions(options) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
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

export function defaultOrgOptions() {
  return mergeOrgOptions(PROJECT_DEPARTMENTS, readLocalOrgOptions());
}
