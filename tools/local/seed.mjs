#!/usr/bin/env node
// Seeds the LOCAL Supabase (tools/local) with test accounts and production-sized sample data.
//
//   node tools/local/seed.mjs                      # default scale
//   node tools/local/seed.mjs --scale 3            # 3x the records
//   node tools/local/seed.mjs --users 100          # number of load-test accounts (default 100)
//   node tools/local/seed.mjs --reset              # wipe local records first
//
// Writes .local/accounts.csv (email,password per line) for tools/load-test.mjs.
// Refuses to run unless SUPABASE_URL in .dev.vars points at 127.0.0.1/localhost.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((arg, i, all) => arg.startsWith("--") ? [arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : null).filter(Boolean));
const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")]; }));
const API = vars.SUPABASE_URL;
const KEY = vars.SUPABASE_SERVICE_ROLE_KEY;
const STATE = vars.APP_STATE_KEY || "local";
if (!API || !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(API)) {
  console.error(`Refusing to seed: SUPABASE_URL (${API}) is not a local address. Run tools/local/start.sh first.`);
  process.exit(1);
}
const SCALE = Number(args.scale || 1);
const LOAD_USERS = Number(args.users || 100);
const PASSWORD = "LocalTest!2026";
const headers = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };

async function api(path, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ---------- accounts ----------
const ROLES = ["Superadmin", "CEO", "Admin", "Accounting", "Sales", "Logistics", "HR", "Product Specialist", "Engineering"];
const named = [
  { email: "superadmin@medlane.local", name: "Local Superadmin", role: "Superadmin", superadmin: true },
  { email: "ceo@medlane.local", name: "Local CEO", role: "CEO" },
  { email: "admin@medlane.local", name: "Local Admin", role: "Admin" },
  { email: "accounting@medlane.local", name: "Local Accounting", role: "Accounting" },
  { email: "sales@medlane.local", name: "Local Sales", role: "Sales" },
  { email: "logistics@medlane.local", name: "Local Logistics", role: "Logistics" },
  { email: "hr@medlane.local", name: "Local HR", role: "HR" },
  { email: "ps@medlane.local", name: "Local Product Specialist", role: "Product Specialist" },
  { email: "engineering@medlane.local", name: "Local Engineering", role: "Engineering" },
];
// Load-test accounts: a realistic office mix, heavy on Sales/Accounting/Logistics. Every 10th is
// an Admin so --stock-race has accounts that can edit stock.
const mix = ["Sales", "Sales", "Accounting", "Logistics", "Sales", "Accounting", "Product Specialist", "Engineering", "HR", "Admin"];
const loadAccounts = Array.from({ length: LOAD_USERS }, (_, i) => ({ email: `load${String(i + 1).padStart(3, "0")}@medlane.local`, name: `Load User ${i + 1}`, role: mix[i % mix.length] }));

async function existingUsers() {
  const byEmail = new Map();
  for (let page = 1; ; page++) {
    const result = await api(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    const users = result.users || [];
    for (const user of users) byEmail.set(user.email, user.id);
    if (users.length < 1000) break;
  }
  return byEmail;
}

async function ensureAccounts(list) {
  const existing = await existingUsers();
  const profiles = [];
  let created = 0;
  for (let i = 0; i < list.length; i += 10) {
    await Promise.all(list.slice(i, i + 10).map(async (account) => {
      let id = existing.get(account.email);
      if (!id) {
        const user = await api("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: account.email, password: PASSWORD, email_confirm: true }) });
        id = user.id;
        created++;
      }
      profiles.push({ id, email: account.email, full_name: account.name, role: account.role, branch: "all", is_superadmin: Boolean(account.superadmin) });
    }));
  }
  await api("/rest/v1/profiles?on_conflict=id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(profiles) });
  return created;
}

// ---------- sample data ----------
let seed = 42;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (list) => list[Math.floor(rand() * list.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pad = (n, width = 4) => String(n).padStart(width, "0");
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const AREAS = ["Region I", "Region II", "Region III", "Region IV-A", "NCR", "Region V", "Visayas Dealer", "Mindanao Dealer"];
const BRANCHES = ["Las Pinas", "Naga"];
const BRANDS = ["Sysmex", "Mindray", "BD", "Eppendorf", "Roche", "Abbott", "Beckman", "Siemens"];
const CATEGORIES = ["Reagents and Diagnostic kit", "Consumables", "Equipment", "Supplies", "Spare parts", "Accessories"];
const UOMS = ["kit", "vial", "box", "unit", "pack", "bottle"];
const SALES_PEOPLE = ["Ana Cruz", "Leo Ramos", "Mika Tan", "Dealer Desk", "Paolo Reyes"];

function buildData() {
  const counts = { clients: 250 * SCALE, suppliers: 40 * SCALE, items: 600 * SCALE, employees: 120, sales: 6000 * SCALE, purchaseOrders: 1500 * SCALE };
  const suppliers = Array.from({ length: counts.suppliers }, (_, i) => ({ name: `Supplier ${pad(i + 1, 3)}`, address: "Makati City", contact: `supplier${i + 1}@example.ph`, docs: "DTI, BIR", items: "Reagents, consumables", entityType: "Corporation" }));
  const clients = Array.from({ length: counts.clients }, (_, i) => { const area = pick(AREAS); return { name: `Client Lab ${pad(i + 1)}`, area, dealer: area.includes("Dealer") ? area : "Direct", address: `${area} address`, contact: `Billing / client${i + 1}@example.ph`, tin: `${pad(i + 1, 3)}-221-640-000`, creditLimit: int(5, 40) * 10000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO, GAIA" }; });
  const items = Array.from({ length: counts.items }, (_, i) => { const cost = int(20, 30000); return { code: `ITM-${pad(i + 1, 5)}`, name: `Item ${pad(i + 1, 5)}`, brand: pick(BRANDS), source: "Supplier", supplier: pick(suppliers).name, category: pick(CATEGORIES), classification: pick(CATEGORIES), uom: pick(UOMS), terms: pick([15, 30, 45]), cost, price: Math.round(cost * 1.5) }; });
  const employees = Array.from({ length: counts.employees }, (_, i) => ({ name: `Employee ${pad(i + 1, 3)}`, role: pick(ROLES), contact: `employee${i + 1}@medlane.local`, benefits: "SSS, PhilHealth, Pag-IBIG", salary: "Confidential" }));
  // 2-4 lots per item per branch: a mix of healthy, near-expiry and expired stock.
  const inventory = [];
  for (const item of items) for (const branch of BRANCHES) for (let lot = 1; lot <= int(1, 3); lot++) {
    inventory.push({ code: item.code, item: item.name, brand: item.brand, branch, lot: `${item.code.slice(4)}-${branch[0]}${lot}`, serial: "N/A", expiry: isoDay(int(-60, 720)), qty: int(0, 400), min: int(5, 40) });
  }
  const purchaseOrders = Array.from({ length: counts.purchaseOrders }, (_, i) => {
    const client = pick(clients);
    const lines = Array.from({ length: int(1, 4) }, () => { const item = pick(items); return { item: item.name, code: item.code, brand: item.brand, qty: int(1, 30), uom: item.uom, price: item.price }; });
    return { id: `PO-LOC-${pad(i + 1, 5)}`, client: client.name, area: client.area, salesperson: pick(SALES_PEOPLE), date: isoDay(-int(0, 540)), lines, status: "For Invoicing" };
  });
  const sales = [];
  const payments = [];
  for (let i = 0; i < counts.sales; i++) {
    const po = pick(purchaseOrders);
    const client = clients.find((entry) => entry.name === po.client) || pick(clients);
    const type = pick(["SI", "SI", "SI", "TS", "DR"]);
    const lines = po.lines.map((line) => ({ ...line, terms: 30, branch: pick(BRANCHES), lot: "" }));
    const amount = type === "DR" ? 0 : lines.reduce((sum, line) => sum + line.qty * line.price, 0);
    const date = isoDay(-int(0, 540));
    const paid = rand() < 0.6 ? amount : rand() < 0.5 ? Math.round(amount * rand()) : 0;
    const id = `${type}-LOC-${pad(i + 1, 6)}`;
    sales.push({ id, documentNo: id, po: po.id, client: client.name, area: client.area, dealer: client.dealer, salesperson: po.salesperson, type, date, item: lines[0].item, brand: lines[0].brand, qty: lines[0].qty, uom: lines[0].uom, amount, discount: 0, discountReason: "", tax: 0, net: amount, terms: 30, paid, status: rand() < 0.03 ? "Cancelled" : "Active", lines, migrated: true });
    if (paid > 0) payments.push({ invoice: id, tag: `${type}-CR`, receiptNo: `CR-LOC-${pad(i + 1, 6)}`, method: pick(["Bank Transfer", "Cheque", "Cash"]), bank: pick(["BPI", "BDO", "Metrobank"]), reference: `REF-${pad(i + 1, 6)}`, chequeDate: "", dateCollected: date, dateRecorded: date, client: client.name, amount: paid });
  }
  const calendarEvents = Array.from({ length: 60 }, (_, i) => ({ id: `EVT-LOC-${i + 1}`, title: pick(["Client visit", "Delivery", "Team meeting", "Calibration", "Training"]) + ` ${i + 1}`, date: isoDay(int(0, 45)), time: `${pad(int(8, 17), 2)}:${pick(["00", "30"])}`, createdBy: "Local Admin", createdByUser: "admin@medlane.local", createdAt: new Date().toISOString() }));
  return { suppliers, clients, items, employees, inventory, purchaseOrders, sales, payments, calendarEvents };
}

// Same record keys the Worker computes (recordKeyFor in src/worker.js).
function recordKeyFor(key, value, index) {
  if (key === "inventory") return [value.code || value.item || "stock", value.branch || "branch", value.lot || value.serial || "lot"].map((part) => String(part).trim() || "-").join("|");
  return String(value.id || value.documentNo || value.receiptNo || value.cvNo || value.code || value.name || value.email || `${key}-${index}`);
}

async function writeRecords(data) {
  const rows = Object.entries(data).flatMap(([moduleName, list]) => list.map((record, index) => ({ state_key: STATE, module_name: moduleName, record_key: recordKeyFor(moduleName, record, index), data: record })));
  for (let i = 0; i < rows.length; i += 1000) {
    await api("/rest/v1/app_records?on_conflict=state_key,module_name,record_key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 1000)) });
    process.stdout.write(`\r  records ${Math.min(i + 1000, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
  return rows.length;
}

// ---------- run ----------
if (args.reset) {
  // app_records has a delete guard trigger (production safety); locally, disable it for the wipe.
  console.log("Resetting local records…");
  const { execFileSync } = await import("node:child_process");
  execFileSync("docker", ["exec", "-i", "supabase_db_medlane", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", `alter table app_records disable trigger app_records_delete_guard; delete from app_records where state_key = '${STATE.replace(/'/g, "''")}'; alter table app_records enable trigger app_records_delete_guard;`], { stdio: "inherit" });
}

console.log(`Seeding local Supabase at ${API} (state "${STATE}", scale ${SCALE})`);
const created = await ensureAccounts([...named, ...loadAccounts]);
console.log(`  accounts: ${named.length + loadAccounts.length} (${created} new), password for all: ${PASSWORD}`);
const total = await writeRecords(buildData());
console.log(`  ${total} records written`);

mkdirSync(".local", { recursive: true });
writeFileSync(".local/accounts.csv", ["# email,password — local test accounts (tools/local/seed.mjs)", ...loadAccounts.map((account) => `${account.email},${PASSWORD}`)].join("\n") + "\n");
writeFileSync(".local/admin-accounts.csv", ["# Admin load accounts, for --stock-race", ...loadAccounts.filter((account) => account.role === "Admin").map((account) => `${account.email},${PASSWORD}`)].join("\n") + "\n");
console.log("  wrote .local/accounts.csv and .local/admin-accounts.csv");
console.log(`\nSign in at http://127.0.0.1:8787 as superadmin@medlane.local / ${PASSWORD} (or any role: ceo@, admin@, accounting@, sales@, logistics@, hr@, ps@, engineering@).`);
