export function getAuthToken() {
  const token = localStorage.getItem("token") || "";
  if (!token) return "";
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export function getAuthHeaders(extraHeaders = {}) {
  const authToken = getAuthToken();
  return authToken
    ? { ...extraHeaders, Authorization: authToken }
    : { ...extraHeaders };
}
