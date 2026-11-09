// @ts-check
const MedlaneAPI = (() => {
  const sessionKey = "medlane-api-session";

  /** @returns {ApiSession | null} */
  function session() {
    return JSON.parse(localStorage.getItem(sessionKey) || "null");
  }

  /** @param {ApiSession | null} value */
  function setSession(value) {
    if (value) localStorage.setItem(sessionKey, JSON.stringify(value));
    else localStorage.removeItem(sessionKey);
  }

  /** @type {any} */
  let refreshInFlight = null;
  let pendingRequestCount = 0;
  /** @param {number} delta */
  function trackGlobalLoading(delta) {
    pendingRequestCount = Math.max(0, pendingRequestCount + delta);
    if (typeof setGlobalLoading === "function") setGlobalLoading(pendingRequestCount > 0);
  }

  async function refreshSession() {
    const active = session();
    if (!active?.refresh_token) throw new Error("No refresh token available");
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const response = await fetchWithDiagnostics("/api/auth/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken: active.refresh_token }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.session?.access_token) {
          /** @type {ApiError} */ const refreshError = new Error(payload?.error || "Session refresh failed");
          refreshError.status = response.status;
          throw refreshError;
        }
        // The user may have logged out, or logged in as someone else, while this was running.
        // Saving now would bring the old session back after they thought it was gone.
        const current = session();
        if (!current || (current.app_session_id || null) !== (active.app_session_id || null)) return payload;
        setSession({ ...payload.session, app_session_id: active.app_session_id || null });
        if (payload.user) localStorage.setItem("medlane-session", JSON.stringify(payload.user));
        return payload;
      })().finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
  }

  /** @param {string | undefined} token @returns {number | null} When the JWT expires, in ms, or null if it can't be read. */
  function tokenExpiryMs(token) {
    try {
      const claims = JSON.parse(atob(String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  const TOKEN_RENEW_MARGIN_MS = 60 * 1000;
  const TOKEN_RENEW_COOLDOWN_MS = 60 * 1000;
  let lastTokenRenewAttempt = 0;
  // Renews a token that is about to expire before it gets sent, so an expired login doesn't cost a
  // burst of 401s. Never throws: if renewing fails the request still goes out, and the 401 handling
  // in requestInner decides what happens. The cooldown stops a wrong device clock, which would make
  // every token look expired, from turning each request into a refresh.
  async function ensureFreshSession() {
    if (refreshInFlight) {
      await refreshInFlight.catch(() => null);
      return;
    }
    const active = session();
    const expiresAt = active?.refresh_token ? tokenExpiryMs(active.access_token) : null;
    if (expiresAt === null || expiresAt - Date.now() > TOKEN_RENEW_MARGIN_MS) return;
    if (Date.now() - lastTokenRenewAttempt < TOKEN_RENEW_COOLDOWN_MS) return;
    lastTokenRenewAttempt = Date.now();
    await refreshSession().catch(() => null);
  }

  /** @param {string} reason */
  function forceSessionLogout(reason) {
    setSession(null);
    localStorage.removeItem("medlane-session");
    if (typeof logoutCurrentUser === "function") logoutCurrentUser();
    if (typeof toast === "function") toast(reason);
  }

  // A plain fetch() rejection only ever says "Failed to fetch" — the browser gives no reason
  // (offline, DNS/CORS failure, connection dropped mid-request, or our own timeout below all look
  // identical). This turns that one opaque message into the closest we can tell from the client:
  // definitely offline, the request took too long, or the server just couldn't be reached at all.
  /** @typedef {Error & {code?: string, transient?: boolean, status?: number}} ApiError */
  /** @param {any} error @returns {ApiError} */
  function classifyFetchFailure(error) {
    if (error?.name === "AbortError") {
      /** @type {ApiError} */ const timeoutError = new Error("The request timed out waiting for the server to respond. The server may be slow or overloaded — check your connection and try again.");
      timeoutError.code = "TIMEOUT";
      timeoutError.transient = true;
      return timeoutError;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      /** @type {ApiError} */ const offlineError = new Error("You appear to be offline. Check your internet connection and try again.");
      offlineError.code = "OFFLINE";
      offlineError.transient = true;
      return offlineError;
    }
    /** @type {ApiError} */ const networkError = new Error("Could not reach the Medlane server. It may be temporarily down or restarting, or your connection was interrupted — check your connection and try again.");
    networkError.code = "NETWORK";
    networkError.transient = true;
    return networkError;
  }

  const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
  // Wraps fetch() with a timeout (so a hung connection fails fast and distinctly, instead of
  // hanging indefinitely) and classifies whatever it throws via classifyFetchFailure above.
  /** @param {string} path @param {RequestInit} [options] @param {number | null} [timeoutMs] */
  async function fetchWithDiagnostics(path, options = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await fetch(path, { ...options, signal: controller.signal });
    } catch (/** @type {any} */ error) {
      throw classifyFetchFailure(error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * @template [T=unknown]
   * @param {string} path @param {Record<string, any>} [options] @param {boolean} [retried]
   * @returns {Promise<T>}
   */
  async function request(path, options = {}, retried = false) {
    trackGlobalLoading(1);
    try {
      return await requestInner(path, options, retried);
    } finally {
      trackGlobalLoading(-1);
    }
  }

  /**
   * @template [T=unknown]
   * @param {string} path @param {Record<string, any>} [options] @param {boolean} [retried]
   * @returns {Promise<T>}
   */
  async function requestInner(path, options = {}, retried = false) {
    await ensureFreshSession();
    const active = session();
    const headers = { ...(options.headers || {}) };
    if (active?.access_token) headers.Authorization = `Bearer ${active.access_token}`;
    if (active?.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
    if (options.body && !(options.body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await fetchWithDiagnostics(path, { ...options, headers }, options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
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
      } catch (refreshError) {
        // Only the server refusing the refresh token ends the login. A dropped connection or an
        // outage says nothing about it, so keep the session (and any unsaved work) and let the
        // caller's normal failure handling retry.
        const refusedWith = /** @type {ApiError} */ (refreshError)?.status;
        if (refusedWith !== 400 && refusedWith !== 401) throw refreshError;
        forceSessionLogout("Your session has expired. Please log in again.");
        throw new Error("Your session has expired. Please log in again.");
      }
      return request(path, options, true);
    }
    if (response.status === 401 && sessionRevoked) {
      forceSessionLogout("Your session was ended. Please log in again.");
      throw new Error("Your session was ended. Please log in again.");
    }
    if (response.status === 401 && sessionExpired) {
      forceSessionLogout("Your session has expired. Please log in again.");
      throw new Error("Your session has expired. Please log in again.");
    }
    if (!response.ok) {
      /** @type {ApiError} */ const error = new Error(payload?.error || `Request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  // Saves are idempotent upserts keyed by record, so a transient failure (network blip, cold
  // Worker, brief Supabase 5xx) is safe to resend. Without this the user saw "Server save failed"
  // on the first click and success on the second. 4xx (permission/validation/conflict) and
  // session errors are thrown straight through.
  /**
   * @template T
   * @param {() => Promise<T>} send @param {number} [attempts]
   * @returns {Promise<T>}
   */
  async function withTransientRetry(send, attempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await send();
      } catch (/** @type {any} */ error) {
        lastError = error;
        const status = Number(error?.status || 0);
        const networkFailure = error?.transient || (!status && /failed to fetch|networkerror|network error|load failed|timed? ?out/i.test(String(error?.message || "")));
        if (!(networkFailure || status >= 500 || status === 429) || attempt === attempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  /** @param {string} email @param {string} password @returns {Promise<LoginResponse>} */
  async function login(email, password) {
    const payload = /** @type {LoginResponse} */ (await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
    setSession(payload.session);
    localStorage.setItem("medlane-session", JSON.stringify(payload.user));
    return payload;
  }

  /** @param {string} email @returns {Promise<OkResponse>} */
  async function forgotPassword(email) {
    return request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
  }

  /** @type {string | null} */
  let changesCursor = null;
  // Server time the in-memory data was last loaded at. Every save sends it as `basedOn` so the
  // server can refuse saves built on data from before a reset/restore (see assertSaveNotStale).
  /** @type {string | null} */
  let dataLoadedAt = null;
  /** @returns {Promise<AppStateResponse>} */
  async function loadAppState() {
    const payload = /** @type {AppStateResponse} */ (await request("/api/modules/state"));
    if (payload?.changesCursor) changesCursor = payload.changesCursor;
    if (payload?.loadedAt) dataLoadedAt = payload.loadedAt;
    return payload;
  }

  // Live-update feed: records changed since the last full load / poll. Silent (no global loading
  // spinner) because it runs in the background every few seconds.
  /** @returns {Promise<ChangesResponse | null>} */
  async function loadChanges() {
    if (!changesCursor) return null;
    const since = changesCursor;
    await ensureFreshSession();
    const send = () => {
      const active = session();
      if (!active?.access_token) return null;
      /** @type {Record<string, string>} */
      const headers = { Authorization: `Bearer ${active.access_token}` };
      if (active.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
      return fetch(`/api/modules/changes?${new URLSearchParams({ since })}`, { headers });
    };
    let response = await send();
    if (response?.status === 401) {
      // Renew and retry once, but never log anyone out from here: this runs in the background, so
      // a failed renewal just means trying again on the next poll.
      const error = (await response.json().catch(() => null))?.error || "";
      if (!/Invalid or expired session|Authentication required/i.test(error)) return null;
      const renewed = await refreshSession().then(() => true, () => false);
      if (!renewed) return null;
      response = await send();
    }
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null);
    if (payload?.cursor) changesCursor = payload.cursor;
    return payload;
  }

  /** @returns {Promise<MeResponse>} */
  async function me() {
    return request("/api/auth/me");
  }

  /** @param {Record<string, any>} nextData @param {number | null} revision @param {string | null} [basedOn] @returns {Promise<SaveResponse>} */
  async function saveAppState(nextData, revision, basedOn = dataLoadedAt) {
    // The server does several sequential Supabase round-trips per save (before-state fetch,
    // event-module diff fetch, validation checks, then the upsert) — under load or a cold
    // Supabase connection that chain can outrun the default 30s. Matches uploadFile's timeout.
    return withTransientRetry(() => request("/api/modules/state", { method: "PUT", body: JSON.stringify({ data: nextData, revision, basedOn }), timeoutMs: 120000 }));
  }

  /** @param {Record<string, any[]>} records @param {Record<string, any>} [recordKeys] @returns {Promise<SaveResponse>} */
  async function saveRecords(records, recordKeys = {}) {
    return withTransientRetry(() => request("/api/modules/records", { method: "POST", body: JSON.stringify({ records, recordKeys, basedOn: dataLoadedAt }) }));
  }

  /** @param {File | Blob} file @param {Record<string, any>} [metadata] @returns {Promise<FileUploadResponse>} */
  async function uploadFile(file, metadata = {}) {
    const form = new FormData();
    form.append("file", file);
    Object.entries(metadata).forEach(([key, value]) => form.append(key, value ?? ""));
    // A large attachment on a slow connection can easily take longer than the default 30s.
    return request("/api/files", { method: "POST", body: form, timeoutMs: 120000 });
  }

  /** @returns {Promise<FilesResponse>} */
  async function listFiles() {
    return request("/api/files");
  }

  /** @param {string | undefined} id */
  async function viewFile(id) {
    await ensureFreshSession();
    const active = session();
    const headers = {};
    if (active?.access_token) headers.Authorization = `Bearer ${active.access_token}`;
    if (active?.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
    // No abort timeout here — file downloads can legitimately take a while; classification alone
    // still tells a genuine network drop apart from offline or a rejected/failed request.
    const response = await fetchWithDiagnostics(`/api/files/${encodeURIComponent(/** @type {string} */ (id))}`, { headers }, null);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Request failed: ${response.status}`);
    }
    const raw = await response.blob();
    // A blob URL lives in the app's own origin, so anything but a passive type (html, svg...) must
    // never be opened — rebuild the blob with a safe type, or download it instead.
    const safeType = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/i.test(raw.type) ? raw.type : "";
    const blob = safeType ? new Blob([raw], { type: safeType }) : new Blob([raw], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    if (safeType) window.open(url, "_blank", "noopener");
    else {
      const name = /filename="?([^";]+)"?/i.exec(response.headers.get("content-disposition") || "")?.[1] || "download";
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /** @param {Record<string, any>} user @returns {Promise<InviteResponse>} */
  async function inviteUser(user) {
    return request("/api/users/invite", { method: "POST", body: JSON.stringify(user) });
  }

  /** @returns {Promise<UsersResponse>} */
  async function listUsers() {
    return request("/api/users");
  }

  /** @param {string} email @returns {Promise<ResendInviteResponse>} */
  async function resendInvite(email) {
    return request("/api/users/invite/resend", { method: "POST", body: JSON.stringify({ email }) });
  }

  /** @param {string} email @returns {Promise<InviteLinkResponse>} */
  async function getInviteLink(email) {
    return request("/api/users/invite/link", { method: "POST", body: JSON.stringify({ email }) });
  }

  /** @param {string} id @returns {Promise<InventoryPoResponse>} */
  async function approvePurchaseOrder(id) {
    return withTransientRetry(() => request(`/api/purchase-orders/${encodeURIComponent(id)}/approve`, { method: "POST" }));
  }

  // Not retried: "advance" steps a PO to whatever status follows its CURRENT one, so a resend
  // after a genuinely successful-but-lost response would read the now-advanced status and step it
  // forward a second time. Approve/cancel are safe to retry because they target a fixed end state.
  /** @param {string} id @returns {Promise<InventoryPoResponse>} */
  async function advancePurchaseOrder(id) {
    return request(`/api/purchase-orders/${encodeURIComponent(id)}/advance`, { method: "POST" });
  }

  /** @param {string} id @param {string} reason @returns {Promise<InventoryPoResponse>} */
  async function cancelPurchaseOrder(id, reason) {
    return withTransientRetry(() => request(`/api/purchase-orders/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }));
  }

  // Generated once per submit and resent unchanged on every retry, so a dropped response after
  // the server already committed re-upserts the same receipt instead of creating a duplicate
  // (the server upserts stock receipts by id — see /api/stock-receipts in worker.js).
  function generateStockReceiptId() {
    return `SR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  /** @param {string | null} poId @param {any[]} lines @param {Record<string, any>} [meta] @returns {Promise<StockReceiptResponse>} */
  async function submitStockReceipt(poId, lines, meta = {}) {
    const id = generateStockReceiptId();
    return withTransientRetry(() => request("/api/stock-receipts", { method: "POST", body: JSON.stringify({ id, poId, lines, ...meta }) }));
  }

  /** @param {string} id @returns {Promise<StockReceiptResponse>} */
  async function approveStockReceipt(id) {
    // Not retried: approving posts to inventory across multiple non-atomic writes, so an
    // automatic resend after a genuinely partial failure risks double-posting stock. The server
    // does short-circuit a resend of an already-approved receipt to a safe success, covering the
    // common "it actually worked, the response just got lost" case if the user clicks Approve again.
    return request(`/api/stock-receipts/${encodeURIComponent(id)}/approve`, { method: "POST" });
  }

  /** @param {string} id @param {string} reason @returns {Promise<StockReceiptResponse>} */
  async function cancelStockReceipt(id, reason) {
    return withTransientRetry(() => request(`/api/stock-receipts/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }));
  }

  /** @param {string} id @param {any[]} lines @param {Record<string, any>} [meta] @returns {Promise<StockReceiptResponse>} */
  async function editStockReceipt(id, lines, meta = {}) {
    return withTransientRetry(() => request(`/api/stock-receipts/${encodeURIComponent(id)}/edit`, { method: "POST", body: JSON.stringify({ lines, ...meta }) }));
  }

  /** @param {string} email @param {string} password @returns {Promise<OkResponse>} */
  async function setUserPassword(email, password) {
    return request("/api/users/set-password", { method: "POST", body: JSON.stringify({ email, password }) });
  }

  /** @param {string | undefined} email @param {boolean} disabled @param {string} [reason] @returns {Promise<UserStatusResponse>} */
  async function setUserDisabled(email, disabled, reason = "") {
    return request("/api/users/status", { method: "POST", body: JSON.stringify({ email, disabled, reason }) });
  }

  /** @param {string} email @param {boolean} granted @returns {Promise<SuperadminResponse>} */
  async function setUserSuperadmin(email, granted) {
    return request("/api/users/superadmin", { method: "POST", body: JSON.stringify({ email, granted }) });
  }

  /** @param {string} email @returns {Promise<ResetPermissionsResponse>} */
  async function resetUserPermissions(email) {
    return request("/api/users/reset-permissions", { method: "POST", body: JSON.stringify({ email }) });
  }

  /** @param {string} email @param {string} confirmation @returns {Promise<OkResponse>} */
  async function deleteUser(email, confirmation) {
    return request("/api/users/delete", { method: "POST", body: JSON.stringify({ email, confirmation }) });
  }

  /** @param {string} accessToken @param {string} password @returns {Promise<OkResponse>} */
  async function setPassword(accessToken, password) {
    return request("/api/auth/set-password", { method: "POST", body: JSON.stringify({ accessToken, password }) });
  }

  /** @param {{ action: string, module: string, record: string }} options @returns {Promise<OkResponse>} */
  async function recordLog({ action, module, record }) {
    return request("/api/logs", { method: "POST", body: JSON.stringify({ action, module, record }) });
  }

  /** @param {Record<string, any>} [params] @returns {Promise<LogsResponse>} */
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

  /** @param {string} id @returns {Promise<DigestMessageResponse>} */
  async function getDigestMessage(id) {
    return request(`/api/logs/digest-message?id=${encodeURIComponent(id)}`);
  }

  // "Load previous" for a module /api/modules/state trimmed to open + most-recent-50 records —
  // fetches the next older page, shaped like /api/modules/changes so it can be merged the same way.
  /** @param {{ module: string, before: string | null, limit: number }} options @returns {Promise<ModulePageResponse>} */
  async function loadModulePage({ module, before, limit }) {
    const query = new URLSearchParams(/** @type {any} */ ({ module, before }));
    if (limit) query.set("limit", /** @type {any} */ (limit));
    return request(`/api/modules/page?${query}`);
  }

  /** @param {string} currentPassword @param {string} newPassword @returns {Promise<OkResponse>} */
  async function changePassword(currentPassword, newPassword) {
    return request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
  }

  /** @returns {Promise<OkResponse>} */
  async function keepCurrentPasswordForKyc() {
    return request("/api/auth/password-kyc/keep", { method: "POST" });
  }

  /** @param {string} theme @returns {Promise<ThemeResponse>} */
  async function setTheme(theme) {
    return request("/api/auth/theme", { method: "POST", body: JSON.stringify({ theme }) });
  }

  /** @param {Record<string, any>} [params] @returns {Promise<UserSessionsResponse>} */
  async function listUserSessions(params = {}) {
    const query = new URLSearchParams();
    if (params.userId) query.set("userId", params.userId);
    if (params.email) query.set("email", params.email);
    return request(`/api/users/sessions${query.toString() ? `?${query}` : ""}`);
  }

  /** @param {string} sessionId @returns {Promise<OkResponse>} */
  async function revokeUserSession(sessionId) {
    return request("/api/users/sessions/revoke", { method: "POST", body: JSON.stringify({ sessionId }) });
  }

  /** @returns {Promise<BackupsResponse>} */
  async function listBackups() {
    return request("/api/backups");
  }

  /** @returns {Promise<BackupStatusResponse>} */
  async function backupStatus() {
    return request("/api/backups/status");
  }

  /** @returns {Promise<StorageUsageResponse>} */
  async function storageUsage() {
    return request("/api/storage/usage");
  }

  /** @param {string} [cursor] @returns {Promise<BackupObjectsResponse>} */
  async function listBackupObjects(cursor = "") {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    return request(`/api/backups/objects${query.toString() ? `?${query}` : ""}`);
  }

  /** @param {string} [branch] @returns {Promise<ReportsResponse>} */
  async function listReports(branch = "all") {
    const query = new URLSearchParams({ branch });
    // Aggregates across the whole dataset — give it more room than the default 30s before
    // treating it as a timeout.
    return request(`/api/reports?${query}`, { timeoutMs: 90000 });
  }

  /** @param {Record<string, any>} payload @returns {Promise<MemoResponse>} */
  async function createMemo(payload) {
    return request("/api/memos", { method: "POST", body: JSON.stringify(payload) });
  }

  /** @param {string} id @returns {Promise<MemoResponse>} */
  async function acknowledgeMemo(id) {
    return request(`/api/memos/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
  }

  /** @param {string} id @param {boolean} [noDate] @param {string} [templateId] @returns {Promise<PrintableInvoice>} */
  async function printableInvoice(id, noDate = false, templateId = "default") {
    const query = new URLSearchParams({ id });
    if (noDate) query.set("noDate", "1");
    if (templateId === "custom") query.set("template", "custom");
    return request(`/api/printables/invoice?${query}`);
  }

  /** @param {string} id @returns {Promise<PrintableDocument>} */
  async function printablePaymentRequest(id) {
    return request(`/api/printables/payment-request?${new URLSearchParams({ id })}`);
  }

  /** @param {string} id @returns {Promise<DescribedPrintable>} */
  async function printableTransfer(id) {
    return request(`/api/printables/transfer?${new URLSearchParams({ id })}`);
  }

  /** @param {string} id @returns {Promise<DescribedPrintable>} */
  async function printableInventoryPurchaseOrder(id) {
    return request(`/api/printables/inventory-po?${new URLSearchParams({ id })}`);
  }

  /** @param {string} type @param {string} id @returns {Promise<DescribedPrintable>} */
  async function printableFinancialRequest(type, id) {
    return request(`/api/printables/financial-request?${new URLSearchParams({ type, id })}`);
  }

  /** @param {string} id @returns {Promise<DescribedPrintable>} */
  async function printableProductIssue(id) {
    return request(`/api/printables/product-issue?${new URLSearchParams({ id })}`);
  }

  /** @param {string} [backupType] @returns {Promise<BackupResponse>} */
  async function runBackup(backupType = "manual") {
    // Snapshots the full dataset and uploads it to R2 — can run well past the default 30s timeout.
    return request("/api/backups", { method: "POST", body: JSON.stringify({ backupType }), timeoutMs: 180000 });
  }

  /** @param {string} [periodLabel] @returns {Promise<DigestRunResponse>} */
  async function runDigest(periodLabel = "Daily") {
    return request("/api/digest/run", { method: "POST", body: JSON.stringify({ periodLabel }) });
  }

  /** @returns {Promise<BirthdayTestResponse>} */
  async function runBirthdayGreetingTest() {
    return request("/api/discord/birthday-test", { method: "POST" });
  }

  /** @param {string} id */
  async function downloadBackup(id) {
    await ensureFreshSession();
    const active = session();
    const headers = {};
    if (active?.access_token) headers.Authorization = `Bearer ${active.access_token}`;
    if (active?.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
    const response = await fetchWithDiagnostics(`/api/backups/${encodeURIComponent(id)}`, { headers }, null);
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

  /** @param {string} key */
  async function downloadBackupObject(key) {
    await ensureFreshSession();
    const active = session();
    const headers = {};
    if (active?.access_token) headers.Authorization = `Bearer ${active.access_token}`;
    if (active?.app_session_id) headers["x-medlane-session-id"] = active.app_session_id;
    const response = await fetchWithDiagnostics(`/api/backups/object?${new URLSearchParams({ key })}`, { headers }, null);
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

  /** @param {Record<string, any>} ref @returns {Promise<RestoreResponse>} */
  async function restoreBackup(ref) {
    // Rewrites the full dataset from a snapshot — can run well past the default 30s timeout.
    return request("/api/backups/restore", { method: "POST", body: JSON.stringify(ref), timeoutMs: 180000 });
  }

  /** @returns {Promise<GameSessionResponse>} */
  async function startGameSession() {
    return request("/api/game/session/start", { method: "POST" });
  }

  /** @param {number} score @param {string} token @param {string} skin @returns {Promise<GameScoreResult>} */
  async function submitGameScore(score, token, skin) {
    // Retry transient failures (offline blip, 5xx, wifi handoff after a long run) a few times —
    // the server treats a repeat submit of the same token as idempotent and returns the stored
    // result, so a retry never double-counts. A definitive rejection (bad/expired/used token,
    // auth) is thrown straight through without retrying.
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await request("/api/game/score", { method: "POST", body: JSON.stringify({ score, token, skin }) });
      } catch (/** @type {any} */ error) {
        lastError = error;
        const message = String(error?.message || "");
        const transient = error?.transient || /failed to fetch|networkerror|network error|load failed|request failed: 5\d\d|timed? ?out/i.test(message);
        if (!transient) throw error;
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  /** @returns {Promise<GameScoreResult>} */
  async function myGameScore() {
    return request("/api/game/score/me");
  }

  /** @param {string | undefined} skin @returns {Promise<GameSkinResponse>} */
  async function setGameSkin(skin) {
    return request("/api/game/skin", { method: "POST", body: JSON.stringify({ skin }) });
  }

  /** @param {string} [by] @returns {Promise<GameLeaderboardResponse>} */
  async function listGameLeaderboard(by = "score") {
    return request(`/api/game/leaderboard?by=${encodeURIComponent(by)}`);
  }

  async function fetchAppVersion() {
    // Plain fetch, not request() — this is polled every few minutes in the background and must
    // not trigger the global loading spinner or carry an auth header. Deciding what to do with the
    // result (defer a reload until it's safe, etc.) lives in events-bootstrap.js, which has the
    // app-level context (open dialogs, unsaved records) this client layer doesn't.
    const response = await fetch("/api/version");
    const payload = await response.json().catch(() => null);
    return payload?.version || "";
  }

  return { session, dataLoadedAt: () => dataLoadedAt, loadChanges, setSession, request, refreshSession, login, forgotPassword, me, loadAppState, saveAppState, saveRecords, uploadFile, listFiles, viewFile, inviteUser, listUsers, resendInvite, getInviteLink, setUserPassword, setUserDisabled, setUserSuperadmin, resetUserPermissions, deleteUser, setPassword, changePassword, keepCurrentPasswordForKyc, setTheme, recordLog, listLogs, getDigestMessage, loadModulePage, listUserSessions, revokeUserSession, listBackups, backupStatus, storageUsage, listBackupObjects, runBackup, runDigest, runBirthdayGreetingTest, downloadBackup, downloadBackupObject, restoreBackup, listReports, printableInvoice, printablePaymentRequest, printableTransfer, printableInventoryPurchaseOrder, printableFinancialRequest, printableProductIssue, approvePurchaseOrder, advancePurchaseOrder, cancelPurchaseOrder, submitStockReceipt, approveStockReceipt, cancelStockReceipt, editStockReceipt, createMemo, acknowledgeMemo, startGameSession, submitGameScore, myGameScore, setGameSkin, listGameLeaderboard, fetchAppVersion };
})();
