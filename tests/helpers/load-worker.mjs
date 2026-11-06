// Loads src/worker.js under plain Node with no production changes: stubs the "cloudflare:workers"
// import and, for this test process only, appends exports for the private functions under test.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const STUB_URL = "medlane-test:cloudflare-workers";
const EXPOSED = [
  "canWrite", "canAccessKey", "requireWriteAccess", "requireUserAdmin", "requireMemoAdmin", "requireBackupAdmin",
  "requireDigestAdmin", "requirePoApprover", "requirePoReceiver", "requirePaymentRequestApprover", "requireStockReceiptApprover",
  "validateNewSaleRows", "assertFinancialApprovalAllowed", "assertCreditApprovalAllowed",
  "assertDemoRequestTransitionsAllowed", "assertSupportReportChangesAllowed", "assertPurchaseOrderClientsNotArchived",
  "demoRequestInitialStatus", "validateReceivingLines", "validRole", "roleModules", "ROLE_BLOCKED_MODULES",
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") return { url: STUB_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === STUB_URL) return { format: "module", source: "export class DurableObject {}", shortCircuit: true };
    if (url.endsWith("/src/worker.js") || url.endsWith("/src/perf-report.js")) {
      let source = readFileSync(fileURLToPath(url), "utf8");
      if (url.endsWith("/src/worker.js")) source += `\nexport { ${EXPOSED.join(", ")} };\n`;
      return { format: "module", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

export const worker = await import("../../src/worker.js");
export const workerSourcePath = fileURLToPath(new URL("../../src/worker.js", import.meta.url));

export const env = { SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key", ENVIRONMENT: "test" };
export const STATE = "test-state";

/** Replaces global fetch with a fake Supabase. `tables` maps module_name to stored { record_key, data } rows. */
export function mockSupabase(tables = {}, { balances = {} } = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    calls.push(url);
    if (url.includes("/rest/v1/rpc/client_sales_balance")) {
      const { p_client } = JSON.parse(init.body);
      return Response.json([{ balance: balances[p_client] ?? 0 }]);
    }
    const moduleName = url.match(/module_name=eq\.([^&]+)/)?.[1];
    let rows = tables[moduleName] || [];
    const keys = url.match(/record_key=in\.\(([^)]*)\)/)?.[1];
    if (keys) {
      const wanted = keys.split(",").map((key) => key.replace(/^"|"$/g, ""));
      rows = rows.filter((row) => wanted.includes(row.record_key));
    }
    return Response.json(rows);
  };
  return calls;
}

export const row = (moduleName, recordKey, data) => ({ module_name: moduleName, record_key: recordKey, data });
export const stored = (recordKey, data) => ({ record_key: recordKey, data });
export const as = (role, edit = []) => ({ id: "u1", role, customPermissions: { enabled: true, view: edit, edit } });
