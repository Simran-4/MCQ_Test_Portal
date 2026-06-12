export function getSafeNextPath(value) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "";

  try {
    const decoded = decodeURIComponent(raw);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return "";
    return decoded;
  } catch {
    return raw;
  }
}

export function loginPathForNext(value) {
  const nextPath = getSafeNextPath(value);
  return nextPath ? `/?next=${encodeURIComponent(nextPath)}` : "/";
}

export function registerPathForNext(value) {
  const nextPath = getSafeNextPath(value);
  return nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : "/register";
}
