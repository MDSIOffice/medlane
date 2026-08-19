const MedlaneAPI = (() => {
  const sessionKey = "medlane-api-session";

  function session() {
    return JSON.parse(localStorage.getItem(sessionKey) || "null");
  }

  function setSession(value) {
    if (value) localStorage.setItem(sessionKey, JSON.stringify(value));
    else localStorage.removeItem(sessionKey);
  }

  let refreshInFlight = null;
  let pendingRequestCount = 0;
  function trackGlobalLoading(delta) {
    pendingRequestCount = Math.max(0, pendingRequestCount + delta);
    if (typeof setGlobalLoading === "function") setGlobalLoading(pendingRequestCount > 0);
  }

  async function refreshSession() {
    const active = session();
    if (!active?.refresh_token) throw new Error("No refresh token available");
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken: active.refresh_token }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.session?.access_token) throw new Error(payload?.error || "Session refresh failed");
        setSession({ ...payload.session, app_session_id: active.app_session_id || null });
        if (payload.user) localStorage.setItem("medlane-session", JSON.stringify(payload.user));
        return payload;
      })().finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
  }

  function forceSessionLogout(reason) {
    setSession(null);
    localStorage.removeItem("medlane-session");
    if (typeof logoutCurrentUser === "function") logoutCurrentUser();
    if (typeof toast === "function") toast(reason);
  }

  async function request(path, options = {}, retried = false) {
    trackGlobalLoading(1);
    try {
      return await requestInner(path, options, retried);
    } finally {
      trackGlobalLoading(-1);
    }
  }

  async function requestInner(path, options = {}, retried = false) {
    const active = session();
    const headers = { ...(options.headers || {}) };
    if (active?.access_token) headers.Authorization = `Bearer ${active.access_token}`;
    if (active?.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
    if (options.body && !(options.body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => null);
    const errorText = payload?.error || "";
    const sessionRevoked = /SESSION_REVOKED|Invalid app session/i.test(errorText);
    const sessionHardExpired = /SESSION_EXPIRED_12H/.test(errorText);
    const sessionExpired = /Invalid or expired session|Authentication required/i.test(errorText);
    if (response.status === 401 && sessionHardExpired) {
      forceSessionLogout("Your 12-hour session has expired. Please log in again.");
      throw new Error("Your 12-hour session has expired. Please log in again.");
    }
    if (response.status === 401 && sessionExpired && !retried && active?.refresh_token) {
      try {
        await refreshSession();
        return request(path, options, true);
      } catch {
        forceSessionLogout("Your session has expired. Please log in again.");
        throw new Error("Your session has expired. Please log in again.");
      }
    }
    if (response.status === 401 && sessionRevoked) {
      forceSessionLogout("Your session was ended. Please log in again.");
      throw new Error("Your session was ended. Please log in again.");
    }
    if (response.status === 401 && sessionExpired) {
      forceSessionLogout("Your session has expired. Please log in again.");
      throw new Error("Your session has expired. Please log in again.");
    }
    if (!response.ok) throw new Error(payload?.error || `Request failed: ${response.status}`);
    return payload;
  }

  async function login(email, password) {
    const payload = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setSession(payload.session);
    localStorage.setItem("medlane-session", JSON.stringify(payload.user));
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

  async function saveRecords(records, recordKeys = {}) {
    return request("/api/modules/records", { method: "POST", body: JSON.stringify({ records, recordKeys }) });
  }

  async function uploadFile(file, metadata = {}) {
    const form = new FormData();
    form.append("file", file);
    Object.entries(metadata).forEach(([key, value]) => form.append(key, value ?? ""));
    return request("/api/files", { method: "POST", body: form });
  }

  async function listFiles() {
    return request("/api/files");
  }

  async function viewFile(id) {
    const active = session();
    const headers = {};
    if (active?.access_token) headers.Authorization = `Bearer ${active.access_token}`;
    if (active?.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
    const response = await fetch(`/api/files/${encodeURIComponent(id)}`, { headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Request failed: ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function inviteUser(user) {
    return request("/api/users/invite", { method: "POST", body: JSON.stringify(user) });
  }

  async function listUsers() {
    return request("/api/users");
  }

  async function resendInvite(email) {
    return request("/api/users/invite/resend", { method: "POST", body: JSON.stringify({ email }) });
  }

  async function getInviteLink(email) {
    return request("/api/users/invite/link", { method: "POST", body: JSON.stringify({ email }) });
  }

  async function approvePurchaseOrder(id) {
    return request(`/api/purchase-orders/${encodeURIComponent(id)}/approve`, { method: "POST" });
  }

  async function advancePurchaseOrder(id) {
    return request(`/api/purchase-orders/${encodeURIComponent(id)}/advance`, { method: "POST" });
  }

  async function cancelPurchaseOrder(id, reason) {
    return request(`/api/purchase-orders/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
  }

  async function receivePurchaseOrderStock(id, lines) {
    return request(`/api/purchase-orders/${encodeURIComponent(id)}/receive`, { method: "POST", body: JSON.stringify({ lines }) });
  }

  async function setUserPassword(email, password) {
    return request("/api/users/set-password", { method: "POST", body: JSON.stringify({ email, password }) });
  }

  async function setUserDisabled(email, disabled, reason = "") {
    return request("/api/users/status", { method: "POST", body: JSON.stringify({ email, disabled, reason }) });
  }

  async function setUserSuperadmin(email, granted) {
    return request("/api/users/superadmin", { method: "POST", body: JSON.stringify({ email, granted }) });
  }

  async function deleteUser(email, confirmation) {
    return request("/api/users/delete", { method: "POST", body: JSON.stringify({ email, confirmation }) });
  }

  async function setPassword(accessToken, password) {
    return request("/api/auth/set-password", { method: "POST", body: JSON.stringify({ accessToken, password }) });
  }

  async function recordLog({ action, module, record }) {
    return request("/api/logs", { method: "POST", body: JSON.stringify({ action, module, record }) });
  }

  async function listLogs(params = {}) {
    const query = new URLSearchParams();
    if (params.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params.dateTo) query.set("dateTo", params.dateTo);
    if (params.role) query.set("role", params.role);
    if (params.module) query.set("module", params.module);
    if (params.user) query.set("user", params.user);
    if (params.limit) query.set("limit", params.limit);
    if (params.before) query.set("before", params.before);
    return request(`/api/logs${query.toString() ? `?${query}` : ""}`);
  }

  async function changePassword(currentPassword, newPassword) {
    return request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
  }

  async function keepCurrentPasswordForKyc() {
    return request("/api/auth/password-kyc/keep", { method: "POST" });
  }

  async function setTheme(theme) {
    return request("/api/auth/theme", { method: "POST", body: JSON.stringify({ theme }) });
  }

  async function listUserSessions(params = {}) {
    const query = new URLSearchParams();
    if (params.userId) query.set("userId", params.userId);
    if (params.email) query.set("email", params.email);
    return request(`/api/users/sessions${query.toString() ? `?${query}` : ""}`);
  }

  async function revokeUserSession(sessionId) {
    return request("/api/users/sessions/revoke", { method: "POST", body: JSON.stringify({ sessionId }) });
  }

  async function listBackups() {
    return request("/api/backups");
  }

  async function backupStatus() {
    return request("/api/backups/status");
  }

  async function storageUsage() {
    return request("/api/storage/usage");
  }

  async function listBackupObjects(cursor = "") {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    return request(`/api/backups/objects${query.toString() ? `?${query}` : ""}`);
  }

  async function listReports(branch = "all") {
    const query = new URLSearchParams({ branch });
    return request(`/api/reports?${query}`);
  }

  async function createMemo(payload) {
    return request("/api/memos", { method: "POST", body: JSON.stringify(payload) });
  }

  async function acknowledgeMemo(id) {
    return request(`/api/memos/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
  }

  async function printableInvoice(id, noDate = false, templateId = "default") {
    const query = new URLSearchParams({ id });
    if (noDate) query.set("noDate", "1");
    if (templateId === "custom") query.set("template", "custom");
    return request(`/api/printables/invoice?${query}`);
  }

  async function printablePaymentRequest(id) {
    return request(`/api/printables/payment-request?${new URLSearchParams({ id })}`);
  }

  async function printableTransfer(id) {
    return request(`/api/printables/transfer?${new URLSearchParams({ id })}`);
  }

  async function printableInventoryPurchaseOrder(id) {
    return request(`/api/printables/inventory-po?${new URLSearchParams({ id })}`);
  }

  async function printableFinancialRequest(type, id) {
    return request(`/api/printables/financial-request?${new URLSearchParams({ type, id })}`);
  }

  async function printableProductIssue(id) {
    return request(`/api/printables/product-issue?${new URLSearchParams({ id })}`);
  }

  async function runBackup(backupType = "manual") {
    return request("/api/backups", { method: "POST", body: JSON.stringify({ backupType }) });
  }

  async function runDigest(periodLabel = "Daily") {
    return request("/api/digest/run", { method: "POST", body: JSON.stringify({ periodLabel }) });
  }

  async function downloadBackup(id) {
    const active = session();
    const headers = {};
    if (active?.access_token) headers.Authorization = `Bearer ${active.access_token}`;
    if (active?.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
    const response = await fetch(`/api/backups/${encodeURIComponent(id)}`, { headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Request failed: ${response.status}`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `medlane-backup-${id}.json.gz`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadBackupObject(key) {
    const active = session();
    const headers = {};
    if (active?.access_token) headers.Authorization = `Bearer ${active.access_token}`;
    if (active?.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
    const response = await fetch(`/api/backups/object?${new URLSearchParams({ key })}`, { headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Request failed: ${response.status}`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || key.split("/").pop() || "medlane-backup.json.gz";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function restoreBackup(ref) {
    return request("/api/backups/restore", { method: "POST", body: JSON.stringify(ref) });
  }

  return { session, setSession, request, refreshSession, login, me, loadAppState, saveAppState, saveRecords, uploadFile, listFiles, viewFile, inviteUser, listUsers, resendInvite, getInviteLink, setUserPassword, setUserDisabled, setUserSuperadmin, deleteUser, setPassword, changePassword, keepCurrentPasswordForKyc, setTheme, recordLog, listLogs, listUserSessions, revokeUserSession, listBackups, backupStatus, storageUsage, listBackupObjects, runBackup, runDigest, downloadBackup, downloadBackupObject, restoreBackup, listReports, printableInvoice, printablePaymentRequest, printableTransfer, printableInventoryPurchaseOrder, printableFinancialRequest, printableProductIssue, approvePurchaseOrder, advancePurchaseOrder, cancelPurchaseOrder, receivePurchaseOrderStock, createMemo, acknowledgeMemo };
})();
