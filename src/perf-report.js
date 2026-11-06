// Weekly Supabase performance report: hourly sampling + report/chart/recommendation building.
// Pure helpers only (no app storage or email here) — worker.js owns persistence and sending.
//
// Data sources (all need SUPABASE_ACCESS_TOKEN except `sys`):
//   db      SQL via the Management API  -> connections, pg_stat_database, pg_stat_statements totals
//   sys     Supabase privileged Prometheus endpoint (service key) -> CPU, memory, disk IO
//   logs    Management API analytics logs -> edge (API), auth, storage, realtime hourly counts
// Every section fails independently; failures are stored in sample.errors and surfaced in the email.

const MGMT_BASE = "https://api.supabase.com/v1/projects";
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
const DOW_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FOCUS_DOWS = [5, 6]; // Friday + Saturday are the days the owners want watched

export function projectRef(env) {
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF;
  return new URL(env.SUPABASE_URL).hostname.split(".")[0];
}

export function hasAccessToken(env) {
  return Boolean(env.SUPABASE_ACCESS_TOKEN);
}

async function mgmtFetch(env, path, init = {}) {
  const response = await fetch(`${MGMT_BASE}/${projectRef(env)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await response.text();
  /** @type {any} */
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!response.ok) throw new Error(`${response.status} ${(payload?.message || payload?.error || text || "").toString().slice(0, 160)}`);
  return payload;
}

// Prefer the read-only SQL endpoint so a token granted only "Database: Read" is enough; fall
// back to the general endpoint if this project/API version doesn't expose the read-only one.
export async function runSql(env, query) {
  const body = JSON.stringify({ query });
  let rows;
  try {
    rows = await mgmtFetch(env, "/database/query/read-only", { method: "POST", body });
  } catch (/** @type {any} */ error) {
    if (!/^404/.test(error.message)) throw error;
    rows = await mgmtFetch(env, "/database/query", { method: "POST", body });
  }
  return Array.isArray(rows) ? rows : [];
}

async function runLogsSql(env, sql, startIso, endIso) {
  const qs = new URLSearchParams({ sql, iso_timestamp_start: startIso, iso_timestamp_end: endIso });
  const payload = await mgmtFetch(env, `/analytics/endpoints/logs.all?${qs}`);
  if (payload?.error) throw new Error(typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error).slice(0, 160));
  return payload?.result || [];
}

const SAMPLE_SQL = `
select
  (select count(*) from pg_stat_activity where datname = current_database()) as conns,
  (select count(*) from pg_stat_activity where datname = current_database() and state = 'active') as active,
  (select count(*) from pg_stat_activity where state = 'idle in transaction') as idle_tx,
  (select setting::int from pg_settings where name = 'max_connections') as max_conns,
  pg_database_size(current_database()) as bytes,
  d.blks_hit, d.blks_read, d.xact_commit, d.xact_rollback, d.deadlocks, d.temp_bytes,
  (select coalesce(sum(calls), 0) from pg_stat_statements) as stmt_calls,
  (select coalesce(sum(total_exec_time), 0) from pg_stat_statements) as stmt_ms,
  (select coalesce(sum(rows), 0) from pg_stat_statements) as stmt_rows
from pg_stat_database d where d.datname = current_database()`;

const num = (value) => (value === null || value === undefined || value === "" ? null : Number(value));

async function sampleDb(env) {
  const [row] = await runSql(env, SAMPLE_SQL);
  if (!row) throw new Error("empty result");
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, num(value)]));
}

function parsePrometheus(text) {
  /** @type {Record<string, any>} */
  const acc = { cpuIdle: 0, cpuTotal: 0, memTotal: null, memAvail: null, ioSec: 0, readB: 0, writeB: 0, fsSize: null, fsAvail: null };
  /** @type {boolean | null} */
  let fsFallback = null;
  for (const line of text.split("\n")) {
    if (!line || line[0] === "#") continue;
    const match = line.match(/^([a-zA-Z_:][\w:]*)(?:\{([^}]*)\})?\s+(\S+)/);
    if (!match) continue;
    const [, name, labels = "", raw] = match;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (name === "node_cpu_seconds_total") { acc.cpuTotal += value; if (labels.includes('mode="idle"')) acc.cpuIdle += value; }
    else if (name === "node_memory_MemTotal_bytes") acc.memTotal = value;
    else if (name === "node_memory_MemAvailable_bytes") acc.memAvail = value;
    else if (name === "node_disk_io_time_seconds_total") acc.ioSec += value;
    else if (name === "node_disk_read_bytes_total") acc.readB += value;
    else if (name === "node_disk_written_bytes_total") acc.writeB += value;
    else if (name === "node_filesystem_size_bytes" || name === "node_filesystem_avail_bytes") {
      const key = name === "node_filesystem_size_bytes" ? "fsSize" : "fsAvail";
      if (labels.includes('mountpoint="/data"')) acc[key] = value;
      else if (labels.includes('mountpoint="/"') && fsFallback === null) { fsFallback = true; if (acc[key] === null) acc[key] = value; }
    }
  }
  return acc;
}

async function sampleSys(env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("service key missing");
  const response = await fetch(`https://${projectRef(env)}.supabase.co/customer/v1/privileged/metrics`, {
    headers: { authorization: `Basic ${btoa(`service_role:${env.SUPABASE_SERVICE_ROLE_KEY}`)}` },
  });
  if (!response.ok) throw new Error(`metrics endpoint ${response.status}`);
  return parsePrometheus(await response.text());
}

const LOG_QUERIES = {
  edge: "select count(*) as total, countif(r.status_code >= 500) as s5xx, countif(r.status_code >= 400 and r.status_code < 500) as s4xx from edge_logs cross join unnest(metadata) as m cross join unnest(m.response) as r",
  auth: "select count(*) as total, countif(m.level = 'error') as errors from auth_logs cross join unnest(metadata) as m",
  storage: "select count(*) as total, countif(m.level = 'error') as errors from storage_logs cross join unnest(metadata) as m",
  realtime: "select count(*) as total, countif(m.level = 'error') as errors from realtime_logs cross join unnest(metadata) as m",
};

async function sampleLog(env, kind, startIso, endIso) {
  const [row] = await runLogsSql(env, LOG_QUERIES[kind], startIso, endIso);
  if (!row) return { total: 0, errors: 0, s5xx: 0, s4xx: 0 };
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, num(value) ?? 0]));
}

// One hourly sample. Counters in db/sys are cumulative (deltas are computed at report time);
// logs hold the count for the hour that just ended.
export async function collectSample(env) {
  const now = Date.now();
  const startIso = new Date(now - 60 * 60 * 1000).toISOString();
  const endIso = new Date(now).toISOString();
  const jobs = {
    db: sampleDb(env),
    sys: sampleSys(env),
    edge: sampleLog(env, "edge", startIso, endIso),
    auth: sampleLog(env, "auth", startIso, endIso),
    storage: sampleLog(env, "storage", startIso, endIso),
    realtime: sampleLog(env, "realtime", startIso, endIso),
  };
  const sample = { t: endIso, errors: {} };
  const settled = await Promise.allSettled(Object.values(jobs));
  Object.keys(jobs).forEach((key, index) => {
    const result = settled[index];
    if (result.status === "fulfilled") sample[key] = result.value;
    else sample.errors[key] = String(result.reason?.message || result.reason).slice(0, 200);
  });
  return sample;
}

// Extra "right now" lookups for the report body (top queries, table health, unused indexes).
export async function collectLiveDetails(env) {
  const run = async (label, sql) => { try { return { rows: await runSql(env, sql) }; } catch (/** @type {any} */ error) { return { rows: [], error: `${label}: ${error.message}`.slice(0, 200) }; } };
  const [queries, tables, indexes] = await Promise.all([
    run("top queries", `select left(regexp_replace(query, '\\s+', ' ', 'g'), 150) as q, calls, round(total_exec_time::numeric) as total_ms, round(mean_exec_time::numeric, 2) as mean_ms, rows
      from pg_stat_statements s join pg_roles r on r.oid = s.userid
      where r.rolname in ('service_role', 'authenticated', 'anon') order by total_exec_time desc limit 8`),
    run("table health", `select relname, n_live_tup as live, n_dead_tup as dead, seq_scan, coalesce(idx_scan, 0) as idx_scan, pg_total_relation_size(relid) as bytes
      from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 10`),
    run("unused indexes", `select indexrelname as idx, relname as tbl, pg_relation_size(indexrelid) as bytes
      from pg_stat_user_indexes where idx_scan = 0 and indexrelname not like '%pkey' and indexrelname not like '%key' order by 3 desc limit 8`),
  ]);
  return { queries, tables, indexes };
}

// ---------- analysis ----------

function manilaParts(ms) {
  const shifted = new Date(ms + MANILA_OFFSET_MS);
  return { dow: shifted.getUTCDay(), hour: shifted.getUTCHours(), dayKey: shifted.toISOString().slice(0, 10) };
}

const delta = (next, prev) => { const diff = Number(next) - Number(prev); return Number.isFinite(diff) && diff >= 0 ? diff : null; };
const avg = (values) => { const list = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v)); return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null; };
const max = (values) => { const list = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v)); return list.length ? Math.max(...list) : null; };

// Turns raw hourly samples into per-hour points (gauges + counter deltas).
export function derivePoints(samples) {
  const sorted = [...samples].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
  const points = [];
  sorted.forEach((sample, index) => {
    const ms = new Date(sample.t).getTime();
    /** @type {Record<string, any>} */
    const point = { ms, ...manilaParts(ms), conns: sample.db?.conns ?? null, active: sample.db?.active ?? null, idleTx: sample.db?.idle_tx ?? null, maxConns: sample.db?.max_conns ?? null, dbBytes: sample.db?.bytes ?? null, edge: sample.edge || null, auth: sample.auth || null, storage: sample.storage || null, realtime: sample.realtime || null };
    const prev = sorted[index - 1];
    const gap = prev ? ms - new Date(prev.t).getTime() : 0;
    if (prev && gap >= 20 * 60e3 && gap <= 3 * 3600e3) {
      if (sample.db && prev.db) {
        const calls = delta(sample.db.stmt_calls, prev.db.stmt_calls);
        const stmtMs = delta(sample.db.stmt_ms, prev.db.stmt_ms);
        point.calls = calls;
        point.avgQueryMs = calls && stmtMs !== null ? stmtMs / calls : null;
        const hit = delta(sample.db.blks_hit, prev.db.blks_hit);
        const read = delta(sample.db.blks_read, prev.db.blks_read);
        point.cacheHit = hit !== null && read !== null && hit + read > 0 ? (hit / (hit + read)) * 100 : null;
        point.deadlocks = delta(sample.db.deadlocks, prev.db.deadlocks);
        point.rollbacks = delta(sample.db.xact_rollback, prev.db.xact_rollback);
        point.tempBytes = delta(sample.db.temp_bytes, prev.db.temp_bytes);
      }
      if (sample.sys && prev.sys) {
        const total = delta(sample.sys.cpuTotal, prev.sys.cpuTotal);
        const idle = delta(sample.sys.cpuIdle, prev.sys.cpuIdle);
        point.cpu = total && idle !== null ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : null;
        const ioSec = delta(sample.sys.ioSec, prev.sys.ioSec);
        point.diskBusy = ioSec !== null ? Math.min(100, (ioSec / (gap / 1000)) * 100) : null;
      }
    }
    if (sample.sys?.memTotal && sample.sys?.memAvail !== null) point.mem = (1 - sample.sys.memAvail / sample.sys.memTotal) * 100;
    if (sample.sys?.fsSize && sample.sys?.fsAvail !== null) point.diskUsed = (1 - sample.sys.fsAvail / sample.sys.fsSize) * 100;
    points.push(point);
  });
  return points;
}

function gridBy(points, key, reducer = avg) {
  return Array.from({ length: 7 }, (_, dow) => Array.from({ length: 24 }, (_, hour) => reducer(points.filter((p) => p.dow === dow && p.hour === hour).map((p) => p[key]))));
}

function groupStats(points, dows) {
  const group = points.filter((p) => dows.includes(p.dow));
  const calls = group.reduce((sum, p) => sum + (p.calls || 0), 0);
  const weighted = group.reduce((sum, p) => sum + (p.avgQueryMs && p.calls ? p.avgQueryMs * p.calls : 0), 0);
  return {
    avgQueryMs: calls ? weighted / calls : null,
    peakActive: max(group.map((p) => p.active)),
    peakConns: max(group.map((p) => p.conns)),
    avgCpu: avg(group.map((p) => p.cpu)),
    peakCpu: max(group.map((p) => p.cpu)),
    peakDiskBusy: max(group.map((p) => p.diskBusy)),
    calls,
  };
}

function dailyRows(points) {
  const byDay = new Map();
  points.forEach((p) => { if (!byDay.has(p.dayKey)) byDay.set(p.dayKey, []); byDay.get(p.dayKey).push(p); });
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dayKey, list]) => {
    const sum = (pick) => list.reduce((total, p) => total + (pick(p) || 0), 0);
    const calls = sum((p) => p.calls);
    const weighted = sum((p) => (p.avgQueryMs && p.calls ? p.avgQueryMs * p.calls : 0));
    return {
      dayKey, dow: list[0].dow, samples: list.length,
      peakActive: max(list.map((p) => p.active)), peakConns: max(list.map((p) => p.conns)),
      avgQueryMs: calls ? weighted / calls : null, calls,
      peakCpu: max(list.map((p) => p.cpu)), avgCpu: avg(list.map((p) => p.cpu)),
      requests: sum((p) => p.edge?.total), s5xx: sum((p) => p.edge?.s5xx), s4xx: sum((p) => p.edge?.s4xx),
      authTotal: sum((p) => p.auth?.total), authErrors: sum((p) => p.auth?.errors),
      storageTotal: sum((p) => p.storage?.total), storageErrors: sum((p) => p.storage?.errors),
      realtimeTotal: sum((p) => p.realtime?.total), realtimeErrors: sum((p) => p.realtime?.errors),
      cacheHit: avg(list.map((p) => p.cacheHit)),
    };
  });
}

// ---------- recommendations ----------

export function buildRecommendations({ points, prevPoints, days, details, errors }) {
  const recs = [];
  const add = (level, title, detail) => recs.push({ level, title, detail });
  const fmt = (n, d = 1) => (n === null || n === undefined ? "n/a" : Number(n).toFixed(d));
  const focus = groupStats(points, FOCUS_DOWS);
  const rest = groupStats(points, [0, 1, 2, 3, 4]);
  const all = /** @type {any} */ (groupStats(points, [0, 1, 2, 3, 4, 5, 6]));
  const maxConns = max(points.map((p) => p.maxConns));

  if (!points.length) {
    add("warn", "No samples collected this week", "The hourly sampler has no data. Check that the SUPABASE_ACCESS_TOKEN secret is set on the Worker and that the 5-minute cron is running.");
    return recs;
  }
  Object.entries(errors || {}).forEach(([section, message]) => add("warn", `Could not collect ${section} data`, `${message}. This section of the report is incomplete until it is fixed (the Supabase access token may be missing/expired, or the log/metrics endpoint changed).`));

  if (maxConns && all.peakConns / maxConns > 0.7) add("warn", "Connection usage is high", `Peak ${all.peakConns} of ${maxConns} connections (${fmt((all.peakConns / maxConns) * 100, 0)}%). Reuse connections, check for idle-in-transaction sessions, or upsize compute before a busy Friday/Saturday.`);
  else if (maxConns) add("good", "Connections have plenty of headroom", `Peak ${all.peakConns} of ${maxConns} (${fmt((all.peakConns / maxConns) * 100, 0)}%).`);

  const idleTxPeak = /** @type {number} */ (max(points.map((p) => p.idleTx)));
  if (idleTxPeak >= 3) add("warn", "Sessions stuck 'idle in transaction'", `Up to ${idleTxPeak} at once. These hold locks and connections; look for code paths that open a transaction and do not commit.`);

  const cache = avg(points.map((p) => p.cacheHit));
  if (cache !== null && cache < 99) add("warn", "Cache hit rate below 99%", `Average ${fmt(cache, 2)}%. The working set no longer fits in memory — add indexes for the heaviest queries or consider more RAM.`);
  else if (cache !== null) add("good", "Cache hit rate is healthy", `Average ${fmt(cache, 2)}%.`);

  if (focus.avgQueryMs !== null && rest.avgQueryMs !== null && focus.avgQueryMs > rest.avgQueryMs * 1.5 && focus.avgQueryMs > 2) add("warn", "Fri/Sat queries run slower than the rest of the week", `Average query time ${fmt(focus.avgQueryMs, 2)} ms on Fri/Sat vs ${fmt(rest.avgQueryMs, 2)} ms Sun–Thu. Fri/Sat load is the capacity constraint: schedule heavy jobs (backups, imports) away from them.`);
  else if (focus.avgQueryMs !== null && rest.avgQueryMs !== null) add("info", "Fri/Sat vs rest of week", `Average query time ${fmt(focus.avgQueryMs, 2)} ms on Fri/Sat vs ${fmt(rest.avgQueryMs, 2)} ms Sun–Thu; peak CPU ${fmt(focus.peakCpu, 0)}% vs ${fmt(rest.peakCpu, 0)}%.`);

  if (all.avgQueryMs !== null && all.avgQueryMs > 50) add("warn", "High average query time", `${fmt(all.avgQueryMs, 1)} ms average across all statements. See the top queries below for the biggest contributors.`);
  if (all.peakCpu !== null && all.peakCpu > 80) add("warn", "CPU spiked above 80%", `Peak CPU ${fmt(all.peakCpu, 0)}%. Sustained CPU on a small instance throttles queries; check what ran at that hour or upsize compute.`);
  if (all.peakDiskBusy !== null && all.peakDiskBusy > 70) add("warn", "Disk was busy more than 70% of an hour", `Peak ${fmt(all.peakDiskBusy, 0)}% disk busy time. If the Disk IO balance in Supabase shows draining, reduce write volume or upsize.`);

  const diskUsed = max(points.map((p) => p.diskUsed));
  if (diskUsed !== null && diskUsed > 70) add("warn", "Database disk is filling up", `${fmt(diskUsed, 0)}% used. Plan a disk increase or archive old data (logs, game sessions).`);

  const deadlocks = points.reduce((sum, p) => sum + (p.deadlocks || 0), 0);
  if (deadlocks > 0) add("warn", "Deadlocks occurred", `${deadlocks} this week. Two writers locked rows in opposite order; review concurrent saves of the same records.`);

  const prevBytes = prevPoints.filter((p) => p.dbBytes).at(0)?.dbBytes;
  const nowBytes = [...points].reverse().find((p) => p.dbBytes)?.dbBytes;
  if (prevBytes && nowBytes) {
    const growth = ((nowBytes - prevBytes) / prevBytes) * 100;
    if (growth > 10) add("info", "Database grew quickly", `+${fmt(growth, 1)}% over the last two weeks (${fmt(nowBytes / 1048576, 0)} MB now).`);
  }

  const reqTotal = days.reduce((s, d) => s + d.requests, 0);
  const err5 = days.reduce((s, d) => s + d.s5xx, 0);
  if (reqTotal && err5 / reqTotal > 0.01) add("warn", "API 5xx error rate above 1%", `${err5} server errors out of ${reqTotal} API requests (${fmt((err5 / reqTotal) * 100, 2)}%). Check Supabase API logs for the failing endpoints.`);
  const authTotal = days.reduce((s, d) => s + d.authTotal, 0);
  const authErr = days.reduce((s, d) => s + d.authErrors, 0);
  if (authTotal && authErr / authTotal > 0.2 && authErr > 50) add("warn", "Many Auth errors", `${authErr} of ${authTotal} auth events errored. Could be failed logins or a brute-force attempt — the Worker's per-IP login throttle limits this; check the audit logs for the source.`);
  const rtErr = days.reduce((s, d) => s + d.realtimeErrors, 0);
  if (rtErr > 20) add("warn", "Realtime errors", `${rtErr} Realtime errors this week. The app uses its own live-update hub, so Supabase Realtime is likely unused — consider disabling it.`);
  const stErr = days.reduce((s, d) => s + d.storageErrors, 0);
  if (stErr > 20) add("warn", "Storage errors", `${stErr} Supabase Storage errors this week.`);

  details?.tables?.rows?.forEach((row) => {
    const live = Number(row.live);
    const dead = Number(row.dead);
    if (live > 1000 && dead / Math.max(1, live) > 0.2) add("warn", `Table ${row.relname} has many dead rows`, `${dead} dead vs ${live} live rows. Autovacuum is behind — consider a manual VACUUM (ANALYZE).`);
    if (Number(row.seq_scan) > 1000 && Number(row.seq_scan) > Number(row.idx_scan) * 5 && live > 5000) add("warn", `Table ${row.relname} is read by sequential scans`, `${row.seq_scan} seq scans vs ${row.idx_scan} index scans on ${live} rows. A covering index for its common filters would help.`);
  });
  const unused = details?.indexes?.rows || [];
  if (unused.length) add("info", "Unused indexes", `${unused.slice(0, 4).map((r) => `${r.idx} (${r.tbl}, ${fmt(Number(r.bytes) / 1024, 0)} KB)`).join(", ")}. Safe to drop only if they stay unused for weeks; they cost write speed.`);

  const slowest = details?.queries?.rows?.[0];
  if (slowest && Number(slowest.mean_ms) > 100) add("warn", "A heavy query dominates", `"${slowest.q}" averages ${slowest.mean_ms} ms over ${slowest.calls} calls.`);

  if (!recs.some((r) => r.level === "warn")) add("good", "No action needed", "Nothing crossed a warning threshold this week.");
  return recs;
}

// ---------- charts ----------

function dowHourChart(title, grid, yLabel) {
  return {
    type: "line",
    data: {
      labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}`),
      datasets: DOW_ORDER.map((dow) => {
        const focus = FOCUS_DOWS.includes(dow);
        const color = dow === 5 ? "#e5484d" : dow === 6 ? "#f5a524" : "#b8c2cc";
        return { label: DOW_NAME[dow], data: grid[dow], borderColor: color, backgroundColor: color, borderWidth: focus ? 3 : 1.2, pointRadius: 0, tension: 0.3, spanGaps: true, order: focus ? 0 : 1 };
      }),
    },
    options: {
      plugins: { title: { display: true, text: title, font: { size: 16 } }, legend: { position: "bottom" } },
      scales: { x: { title: { display: true, text: "Hour of day (Manila)" } }, y: { beginAtZero: true, title: { display: true, text: yLabel } } },
    },
  };
}

function requestsChart(days) {
  return {
    type: "bar",
    data: {
      labels: days.map((d) => `${DOW_NAME[d.dow]} ${d.dayKey.slice(5)}`),
      datasets: [{ label: "API requests", data: days.map((d) => d.requests), backgroundColor: days.map((d) => (d.dow === 5 ? "#e5484d" : d.dow === 6 ? "#f5a524" : "#6ea8d6")) }],
    },
    options: { plugins: { title: { display: true, text: "API requests per day (Fri red, Sat amber)", font: { size: 16 } }, legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  };
}

async function chartImageUrl(config) {
  try {
    const response = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chart: config, width: 640, height: 300, backgroundColor: "white", format: "png", version: "4" }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.success && payload.url ? payload.url : null;
  } catch { return null; }
}

// ---------- email body ----------

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const C = { navy: "#0b2f52", border: "#d8e3ec", soft: "#f4f8fb", warn: "#b4561a", warnBg: "#fff4e8", good: "#157a3c", goodBg: "#e8f7ee", info: "#1d6fa5", infoBg: "#eaf4fb", fri: "#fde8e8", sat: "#fff3dc" };
const f = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "–" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));

/** @param {any} headers @param {any} rows @param {(i: number) => string} [rowStyle] */
function table(headers, rows, rowStyle = () => "") {
  const th = headers.map((h) => `<th style="text-align:${h.align || "left"};padding:6px 8px;background:${C.soft};border-bottom:1px solid ${C.border};font-size:12px;color:${C.navy};">${esc(h.label)}</th>`).join("");
  const tr = rows.map((row, i) => `<tr style="${rowStyle(i)}">${row.map((cell, j) => `<td style="text-align:${headers[j].align || "left"};padding:6px 8px;border-bottom:1px solid ${C.border};font-size:12px;">${cell}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${C.border};border-collapse:collapse;margin:8px 0 16px;"><tr>${th}</tr>${tr}</table>`;
}

function statCard(label, value, sub) {
  return `<td style="padding:10px 12px;border:1px solid ${C.border};background:${C.soft};"><div style="font-size:11px;color:#5b6b7a;text-transform:uppercase;letter-spacing:.04em;">${esc(label)}</div><div style="font-size:20px;font-weight:700;color:${C.navy};">${value}</div><div style="font-size:11px;color:#5b6b7a;">${sub}</div></td>`;
}

export async function buildWeeklyReport({ samples, prevSamples, details, now = Date.now() }) {
  const points = derivePoints(samples);
  const prevPoints = derivePoints(prevSamples);
  const days = dailyRows(points);
  const errors = {};
  samples.forEach((s) => Object.entries(s.errors || {}).forEach(([k, v]) => { errors[k] = v; }));
  // Only surface an error if the latest samples are still failing for that section.
  const latest = samples.slice(-3);
  Object.keys(errors).forEach((k) => { if (!latest.some((s) => s.errors?.[k])) delete errors[k]; });
  const recs = buildRecommendations({ points, prevPoints, days, details, errors });
  const focus = groupStats(points, FOCUS_DOWS);
  const rest = groupStats(points, [0, 1, 2, 3, 4]);
  const all = /** @type {any} */ (groupStats(points, [0, 1, 2, 3, 4, 5, 6]));
  const maxConns = max(points.map((p) => p.maxConns));
  const latestDb = [...points].reverse().find((p) => p.dbBytes);
  const warnCount = recs.filter((r) => r.level === "warn").length;

  const chartConfigs = [
    dowHourChart("Active connections by hour (Fri red, Sat amber)", gridBy(points, "active", max), "connections"),
    dowHourChart("Average query time by hour (ms)", gridBy(points, "avgQueryMs"), "ms"),
    dowHourChart("CPU usage by hour (%)", gridBy(points, "cpu"), "%"),
    requestsChart(days),
  ];
  const chartUrls = points.length ? await Promise.all(chartConfigs.map(chartImageUrl)) : [];
  const chartsHtml = chartUrls.map((url) => (url ? `<p style="margin:8px 0;"><img src="${esc(url)}" width="600" alt="chart" style="max-width:100%;border:1px solid ${C.border};"></p>` : "")).join("")
    || "";

  const cards = `<table role="presentation" width="100%" cellspacing="6" cellpadding="0" style="margin:8px -6px;"><tr>
    ${statCard("Peak connections", `${f(all.peakConns)}${maxConns ? ` / ${f(maxConns)}` : ""}`, "at sample time")}
    ${statCard("Avg query time", `${f(all.avgQueryMs, 2)} ms`, `Fri/Sat ${f(focus.avgQueryMs, 2)} · Sun–Thu ${f(rest.avgQueryMs, 2)}`)}
    ${statCard("Peak CPU", `${f(all.peakCpu, 0)}%`, `Fri/Sat ${f(focus.peakCpu, 0)}% · Sun–Thu ${f(rest.peakCpu, 0)}%`)}
    ${statCard("Database size", latestDb ? `${f(latestDb.dbBytes / 1048576, 0)} MB` : "–", `${f(all.calls)} queries this week`)}
  </tr></table>`;

  const recsHtml = recs.map((r) => {
    const style = r.level === "warn" ? [C.warnBg, C.warn, "⚠"] : r.level === "good" ? [C.goodBg, C.good, "✓"] : [C.infoBg, C.info, "ℹ"];
    return `<div style="background:${style[0]};border-left:4px solid ${style[1]};padding:8px 12px;margin:6px 0;font-size:13px;"><strong style="color:${style[1]};">${style[2]} ${esc(r.title)}</strong><div style="color:#334155;margin-top:2px;">${esc(r.detail)}</div></div>`;
  }).join("");

  const dayTable = table(
    [{ label: "Day" }, { label: "Peak conns", align: "right" }, { label: "Avg query ms", align: "right" }, { label: "Peak CPU %", align: "right" }, { label: "API requests", align: "right" }, { label: "5xx", align: "right" }, { label: "Auth events / errors", align: "right" }, { label: "Storage / Realtime errors", align: "right" }],
    days.map((d) => [`<strong>${DOW_NAME[d.dow]}</strong> ${esc(d.dayKey.slice(5))}`, f(d.peakConns), f(d.avgQueryMs, 2), f(d.peakCpu, 0), f(d.requests), f(d.s5xx), `${f(d.authTotal)} / ${f(d.authErrors)}`, `${f(d.storageErrors)} / ${f(d.realtimeErrors)}`]),
    (i) => (days[i].dow === 5 ? `background:${C.fri};` : days[i].dow === 6 ? `background:${C.sat};` : ""),
  );

  const queriesHtml = details?.queries?.rows?.length
    ? table([{ label: "Query" }, { label: "Calls", align: "right" }, { label: "Total ms", align: "right" }, { label: "Mean ms", align: "right" }], details.queries.rows.map((r) => [`<code style="font-size:11px;">${esc(r.q)}</code>`, f(Number(r.calls)), f(Number(r.total_ms)), f(Number(r.mean_ms), 2)]))
    : `<p style="font-size:12px;color:#5b6b7a;">${esc(details?.queries?.error || "No query statistics available.")}</p>`;
  const tablesHtml = details?.tables?.rows?.length
    ? table([{ label: "Table" }, { label: "Size MB", align: "right" }, { label: "Live rows", align: "right" }, { label: "Dead rows", align: "right" }, { label: "Seq scans", align: "right" }, { label: "Index scans", align: "right" }], details.tables.rows.map((r) => [esc(r.relname), f(Number(r.bytes) / 1048576, 1), f(Number(r.live)), f(Number(r.dead)), f(Number(r.seq_scan)), f(Number(r.idx_scan))]))
    : `<p style="font-size:12px;color:#5b6b7a;">${esc(details?.tables?.error || "No table statistics available.")}</p>`;

  const h = (text) => `<h3 style="margin:18px 0 8px;color:${C.navy};">${esc(text)}</h3>`;
  const bodyHtml = [
    `<p style="font-size:13px;color:#334155;">${warnCount ? `<strong style="color:${C.warn};">${warnCount} item${warnCount > 1 ? "s" : ""} need attention.</strong>` : `<strong style="color:${C.good};">Everything looks healthy.</strong>`} Based on ${samples.length} hourly samples; Friday and Saturday are highlighted.</p>`,
    cards,
    h("Recommendations"), recsHtml,
    chartsHtml ? h("Graphs") + chartsHtml : "",
    h("Day by day"), days.length ? dayTable : "<p style=\"font-size:12px;\">No data.</p>",
    h("Heaviest queries (app traffic)"), queriesHtml,
    h("Largest tables"), tablesHtml,
    `<p style="font-size:11px;color:#5b6b7a;margin-top:16px;">Connection and CPU figures are hourly snapshots, so very short spikes can be missed. Query statistics are totals since Supabase last reset them.</p>`,
  ].join("");

  const range = days.length ? `${days[0].dayKey} → ${/** @type {any} */ (days.at(-1)).dayKey}` : new Date(now).toISOString().slice(0, 10);
  return { subject: `Medlane Weekly Supabase Performance — ${range}${warnCount ? ` (${warnCount} to review)` : " (healthy)"}`, bodyHtml, warnCount, sampleCount: samples.length, recommendationTitles: recs.filter((r) => r.level === "warn").map((r) => r.title) };
}
