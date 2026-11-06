// Serves public/ and fakes the worker's API, using the same auth errors as src/worker.js. An endpoint
// it doesn't know gets a 404, which fails the smoke test, so it can't hide a new call.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { seedData } from "./seed-data.mjs";

const port = Number(process.argv[2] || 8799);
const seedScale = Number(process.argv[3] || 0);
const root = fileURLToPath(new URL("../../public/", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg" };
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const fakeToken = (role, expiresInSeconds = 3600) => `${b64({ alg: "none" })}.${b64({ role, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}.fake`;
const claims = (token) => { try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url")); } catch { return null; } };
const roleFromEmail = (email) => ({ superadmin: "Superadmin", ceo: "CEO", admin: "Admin", accounting: "Accounting", sales: "Sales", logistics: "Logistics" })[String(email).split("@")[0]] || "Superadmin";
const ROLE_MODULES = {
  Logistics: ["dashboard", "calendar", "inventory", "purchase-orders"],
  Accounting: ["dashboard", "calendar", "sales", "invoicing", "collections", "receivables-tracker", "payables", "replenishments", "reports"],
};
const userFor = (role) => ({
  id: `fake-${role}`, name: `Fake ${role}`, email: `${role.toLowerCase()}@medlane.test`, role, branch: "Las Pinas", phone: "",
  modules: ROLE_MODULES[role] || [], customPermissions: { enabled: false, view: [], edit: [] }, passwordKycDue: false, themePreference: "dark",
});
const newSession = (role) => ({ access_token: fakeToken(role), refresh_token: `refresh-${role}`, app_session_id: "00000000-0000-4000-8000-000000000001" });
const readBody = async (req) => { let text = ""; for await (const chunk of req) text += chunk; try { return JSON.parse(text); } catch { return {}; } };

const authedRoutes = {
  "GET /api/auth/me": (role) => ({ user: userFor(role) }),
  "GET /api/modules/state": () => ({ data: seedData(seedScale), revision: 1, changesCursor: "cursor-1", pagination: {} }),
  "PUT /api/modules/state": () => ({ revision: 2 }),
  "POST /api/modules/records": () => ({ revision: 2 }),
  "GET /api/modules/changes": () => ({ rows: [], cursor: "cursor-2" }),
  "GET /api/users": (role) => ({ users: [userFor(role)] }),
  "GET /api/files": () => ({ files: [] }),
  "GET /api/logs": () => ({ entries: [], nextCursor: null }),
  "POST /api/logs": () => ({ ok: true }),
  "GET /api/backups": () => ({ backups: [] }),
  "GET /api/backups/status": () => ({ latest: null, ageHours: null, stale: true, message: "Fake backend" }),
  "GET /api/backups/objects": () => ({ objects: [], cursor: null }),
  "GET /api/storage/usage": () => ({ configured: true, usedBytes: 100, objectCount: null, truncated: false, maxBytes: 1000, remainingBytes: 900 }),
  "GET /api/auth/sessions": () => ({ sessions: [] }),
  "GET /api/reports": () => ({ reports: [] }),
  "GET /api/game/leaderboard": () => ({ entries: [] }),
  "GET /api/game/me": () => ({ score: null }),
};

// Compressed like production, so transfer sizes and timings mean something.
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", "content-encoding": "gzip" }); res.end(gzipSync(JSON.stringify(body))); };

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://x");
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/auth/login") {
      const { email } = await readBody(req);
      const role = roleFromEmail(email);
      return send(res, 200, { session: newSession(role), user: userFor(role) });
    }
    if (pathname === "/api/auth/refresh") {
      const { refreshToken } = await readBody(req);
      const role = String(refreshToken).replace("refresh-", "");
      if (!refreshToken || refreshToken === "refused") return send(res, 401, { error: "Invalid Refresh Token" });
      return send(res, 200, { session: newSession(role), user: userFor(role) });
    }
    if (pathname === "/api/version") return send(res, 200, { version: "smoke" });
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return send(res, 401, { error: "Authentication required" });
    const claim = claims(token);
    if (!claim || claim.exp * 1000 <= Date.now()) return send(res, 401, { error: "Invalid or expired session" });
    const route = authedRoutes[`${req.method} ${pathname}`];
    if (!route) return send(res, 404, { error: `Fake backend has no ${req.method} ${pathname}` });
    return send(res, 200, route(claim.role));
  }
  let file = join(root, decodeURIComponent(pathname));
  try { if (!(await stat(file)).isFile()) throw new Error("not a file"); } catch { file = join(root, "index.html"); }
  const type = TYPES[extname(file)] || "application/octet-stream";
  const content = await readFile(file);
  const compress = /text|javascript|json|svg/.test(type);
  res.writeHead(200, { "content-type": type, "cache-control": "no-store", ...(compress ? { "content-encoding": "gzip" } : {}) });
  res.end(compress ? gzipSync(content) : content);
}).listen(port, "127.0.0.1");
