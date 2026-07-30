const MedlaneAPI = (() => {
  const sessionKey = "medlane-api-session";

  function session() {
    return JSON.parse(sessionStorage.getItem(sessionKey) || "null");
  }

  function setSession(value) {
    if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
    else sessionStorage.removeItem(sessionKey);
  }

  async function request(path, options = {}) {
    const active = session();
    const headers = { ...(options.headers || {}) };
    if (active?.access_token) headers.Authorization = `Bearer ${active.access_token}`;
    if (active?.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
    if (options.body && !(options.body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && /SESSION_REVOKED|Invalid app session/i.test(payload?.error || "")) {
      setSession(null);
      sessionStorage.removeItem("medlane-session");
    }
    if (!response.ok) throw new Error(payload?.error || `Request failed: ${response.status}`);
    return payload;
  }

  async function login(email, password) {
    const payload = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setSession(payload.session);
    sessionStorage.setItem("medlane-session", JSON.stringify(payload.user));
    return payload;
  }

  async function loadAppState() {
    return request("/api/modules/state");
  }

  async function me() {
    return request("/api/auth/me");
  }

  async function saveAppState(nextData, revision) {
    return request("/api/modules/state", { method: "PUT", body: JSON.stringify({ data: nextData, revision }) });
  }

  async function uploadFile(file, metadata = {}) {
    const form = new FormData();
    form.append("file", file);
    Object.entries(metadata).forEach(([key, value]) => form.append(key, value ?? ""));
    return request("/api/files", { method: "POST", body: form });
  }

  async function inviteUser(user) {
    return request("/api/users/invite", { method: "POST", body: JSON.stringify(user) });
  }

  async function setPassword(accessToken, password) {
    return request("/api/auth/set-password", { method: "POST", body: JSON.stringify({ accessToken, password }) });
  }

  async function changePassword(currentPassword, newPassword) {
    return request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
  }

  async function listUserSessions() {
    return request("/api/users/sessions");
  }

  async function revokeUserSession(sessionId) {
    return request("/api/users/sessions/revoke", { method: "POST", body: JSON.stringify({ sessionId }) });
  }

  return { session, setSession, request, login, me, loadAppState, saveAppState, uploadFile, inviteUser, setPassword, changePassword, listUserSessions, revokeUserSession };
})();
