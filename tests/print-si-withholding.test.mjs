import { test } from "node:test";
import assert from "node:assert/strict";
import { worker } from "./helpers/load-worker.mjs";

// Figures from the client's sample SI: 51,710.00 VAT-inclusive → 46,169.64 net of VAT → 2% = 923.39.
const sale = { id: "SI-9348", documentNo: "9348", type: "SI", client: "FLD", date: "2026-11-26", terms: 30, amount: 51710, discount: 0, net: 51710, lines: [] };
const render = (withholding) => worker.printableInvoiceHtml({ sale, client: { salesperson: "Janelle" }, approvals: {}, preparedBy: "Prep", noDate: false, templateOverrides: null, withholding });
const field = (html, key) => html.match(new RegExp(`class="field ${key}"[^>]*>([^<]*)<`))?.[1];

test("withholding is off by default: no line, total unchanged", () => {
  const html = render(false);
  assert.equal(field(html, "si-wht"), undefined);
  assert.match(field(html, "si-amount-due"), /51,710\.00/);
});
test("withholding on prints 2% of net of VAT and deducts it from the amount due", () => {
  const html = render(true);
  assert.match(field(html, "si-wht"), /923\.39/);
  assert.match(field(html, "si-amount-due"), /50,786\.61/);
});
test("new top/bottom fields carry the expected values", () => {
  const html = render(false);
  assert.match(field(html, "si-due"), /12\/26\/2026/);
  assert.equal(field(html, "si-salesperson"), "Janelle");
  assert.match(field(html, "si-vatable"), /46,169\.64/);
  assert.match(field(html, "si-vat-amount"), /5,540\.36/);
  assert.match(field(html, "si-less-vat"), /5,540\.36/);
});
